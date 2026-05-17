// Behavioural test for createAuditRun.
//
// Covers the critical paths in create-audit-run.ts:
//   1. Happy path (new project + new run, enqueue succeeds → enqueueMode persisted)
//   2. Project reuse (existing project → batch.update, not batch.set)
//   3. PRD size guard rejects payloads > 200KB before touching Firestore
//   4. Enqueue failure flips run to FAILED (with enqueueMode: null), re-throws
//   5. FAILED-mark write also fails → stderr fallback, original error still thrown
//   6. Successful enqueue updates the run exactly once with enqueueMode only
//   7. enqueueMode 'direct-worker' is persisted verbatim
//   8. enqueueMode 'stub' is persisted verbatim
//   9. Initial batch.set payload carries enqueueMode: null

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

// --- Hoisted mocks -----------------------------------------------------------
const SERVER_TS_SENTINEL = '__SERVER_TIMESTAMP__';

const {
  getAdminFirestoreMock,
  enqueueMock,
  parseGitHubUrlMock,
  parseDeployUrlMock,
  reserveDailyQuotaSlotMock,
  reserveIpSlotMock,
} = vi.hoisted(() => ({
  getAdminFirestoreMock: vi.fn(),
  enqueueMock: vi.fn(),
  parseGitHubUrlMock: vi.fn(),
  parseDeployUrlMock: vi.fn(),
  reserveDailyQuotaSlotMock: vi.fn(),
  reserveIpSlotMock: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => SERVER_TS_SENTINEL,
  },
}));

vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: getAdminFirestoreMock,
}));

vi.mock('@/lib/cloud-tasks/enqueue', () => ({
  enqueueAuditTask: enqueueMock,
}));

vi.mock('@/lib/validation/github-url', () => ({
  parseGitHubUrl: parseGitHubUrlMock,
}));

vi.mock('@/lib/validation/deploy-url', () => ({
  parseDeployUrl: parseDeployUrlMock,
}));

// T1.1c daily quota: existing happy-path tests must continue to pass; default
// stub returns allowed=true. The dedicated denial test below overrides this
// once with `allowed: false` to exercise the DailyQuotaExceededError branch.
vi.mock('./daily-quota', () => ({
  reserveDailyQuotaSlot: reserveDailyQuotaSlotMock,
}));

// T1.1a per-IP rate limit: same shape as daily-quota mock. Default
// `allowed: true` keeps all unrelated tests on the happy path; the dedicated
// denial test overrides with `allowed: false` to exercise PerIpRateLimitError.
vi.mock('./per-ip-rate-limit', () => ({
  reserveIpSlot: reserveIpSlotMock,
}));

// --- Helpers -----------------------------------------------------------------
interface FsMock {
  db: { collection: ReturnType<typeof vi.fn>; batch: ReturnType<typeof vi.fn> };
  runRef: { id: string; update: ReturnType<typeof vi.fn> };
  runsCol: { doc: ReturnType<typeof vi.fn> };
  projectsCol: {
    where: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    doc: ReturnType<typeof vi.fn>;
  };
  // T2.5: exposed so tests can override the resolvePreviousRunId query result.
  // Default `get()` returns an empty snapshot — set
  // `fs.previousRunQuery.get.mockResolvedValueOnce({ empty: false, docs: [...] })`
  // to simulate a prior COMPLETED run.
  previousRunQuery: {
    where: ReturnType<typeof vi.fn>;
    orderBy: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  batchSet: ReturnType<typeof vi.fn>;
  batchUpdate: ReturnType<typeof vi.fn>;
  batchCommit: ReturnType<typeof vi.fn>;
}

function makeFirestoreMock(opts: {
  projectExists: boolean;
  existingProjectId?: string;
  runId?: string;
  newProjectId?: string;
}): FsMock {
  const runRef = {
    id: opts.runId ?? 'run-test-1',
    update: vi.fn().mockResolvedValue(undefined),
  };

  // T2.5: resolvePreviousRunId calls db.collection('auditRuns').where(...)
  //   .where(...).where(...).orderBy(...).limit(1).get(). Default → no
  //   previous run (empty snapshot). Override `previousRunGetResult` per-test
  //   to simulate a prior COMPLETED run.
  const previousRunQuery: {
    where: ReturnType<typeof vi.fn>;
    orderBy: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  } = {
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
  };
  previousRunQuery.where.mockReturnValue(previousRunQuery);
  previousRunQuery.orderBy.mockReturnValue(previousRunQuery);
  previousRunQuery.limit.mockReturnValue(previousRunQuery);

  const runsCol = {
    doc: vi.fn(() => runRef),
    where: previousRunQuery.where,
  };

  const newProjectRef = { id: opts.newProjectId ?? 'proj-new-1' };
  const existingDocSnap = {
    id: opts.existingProjectId ?? 'proj-existing-1',
  };
  const queryGetResult = opts.projectExists
    ? { empty: false, docs: [existingDocSnap] }
    : { empty: true, docs: [] };

  const projectsCol = {
    where: vi.fn(),
    limit: vi.fn(),
    get: vi.fn().mockResolvedValue(queryGetResult),
    doc: vi.fn((id?: string) => (id ? { id } : newProjectRef)),
  };
  // chainable: where → limit → get
  projectsCol.where.mockReturnValue(projectsCol);
  projectsCol.limit.mockReturnValue(projectsCol);

  const batchSet = vi.fn();
  const batchUpdate = vi.fn();
  const batchCommit = vi.fn().mockResolvedValue(undefined);
  const batchObj = { set: batchSet, update: batchUpdate, commit: batchCommit };

  const db = {
    collection: vi.fn((path: string) => {
      if (path === 'auditRuns') return runsCol;
      if (path.startsWith('users/')) return projectsCol;
      throw new Error(`Unmocked Firestore path: ${path}`);
    }),
    batch: vi.fn(() => batchObj),
  };

  return {
    db: db as unknown as FsMock['db'],
    runRef,
    runsCol: runsCol as unknown as FsMock['runsCol'],
    projectsCol: projectsCol as unknown as FsMock['projectsCol'],
    previousRunQuery,
    batchSet,
    batchUpdate,
    batchCommit,
  };
}

const DEFAULT_PARSED_REPO = {
  owner: 'octo',
  repo: 'hello',
  branch: null,
  normalizedUrl: 'https://github.com/octo/hello',
};

// --- Tests -------------------------------------------------------------------
describe('createAuditRun', () => {
  let stderrSpy: MockInstance<unknown[], unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    parseGitHubUrlMock.mockReturnValue(DEFAULT_PARSED_REPO);
    parseDeployUrlMock.mockReturnValue({
      url: 'https://example.com/',
      hostname: 'example.com',
      isHttps: true,
      warning: null,
    });
    enqueueMock.mockResolvedValue({ mode: 'cloud-tasks', taskName: 'task-1' });
    reserveDailyQuotaSlotMock.mockResolvedValue({
      bucketId: '2026-05-17',
      count: 1,
      max: 1000,
      allowed: true,
    });
    reserveIpSlotMock.mockResolvedValue({
      ipKey: '1.2.3.4',
      bucketId: '2026-05-17T11:30',
      count: 1,
      max: 10,
      allowed: true,
      retryAfterSeconds: 30,
    });
    stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true) as unknown as MockInstance<unknown[], unknown>;
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('creates project + run + enqueues task on the happy path (new project)', async () => {
    const fs = makeFirestoreMock({ projectExists: false, runId: 'run-happy-1' });
    getAdminFirestoreMock.mockReturnValue(fs.db);

    const { createAuditRun } = await import('./create-audit-run');
    const result = await createAuditRun(
      { repoUrl: 'https://github.com/octo/hello', deployUrl: 'https://example.com/' },
      { ownerId: 'user-1' },
    );

    expect(result).toEqual({
      auditRunId: 'run-happy-1',
      projectId: 'proj-new-1',
      status: 'PENDING',
    });

    // Project was set (new), not updated.
    expect(fs.batchSet).toHaveBeenCalledTimes(2); // project + run
    expect(fs.batchUpdate).not.toHaveBeenCalled();
    expect(fs.batchCommit).toHaveBeenCalledTimes(1);

    // Project doc was written with derived name + parsed urls.
    const projectSetCall = fs.batchSet.mock.calls[0]!;
    expect(projectSetCall[1]).toMatchObject({
      ownerId: 'user-1',
      name: 'octo/hello',
      repoUrl: 'https://github.com/octo/hello',
      deployUrl: 'https://example.com/',
      repoOwner: 'octo',
      repoName: 'hello',
    });

    // Run doc was written PENDING with enqueueMode initialized to null —
    // the schema requires the field, but the dispatch route is unknown until
    // enqueueAuditTask resolves.
    const runSetCall = fs.batchSet.mock.calls[1]!;
    expect(runSetCall[1]).toMatchObject({
      ownerId: 'user-1',
      status: 'PENDING',
      progress: 0,
      projectId: 'proj-new-1',
      repoUrl: 'https://github.com/octo/hello',
      deployUrl: 'https://example.com/',
      enqueueMode: null,
    });

    // Enqueue called with derived payload.
    expect(enqueueMock).toHaveBeenCalledWith({
      runId: 'run-happy-1',
      projectId: 'proj-new-1',
      ownerId: 'user-1',
      repoUrl: 'https://github.com/octo/hello',
      deployUrl: 'https://example.com/',
      prdText: null,
      commitHash: null,
    });

    // Happy path performs exactly one post-commit update: enqueueMode +
    // updatedAt only. Status stays PENDING (the worker owns transitions).
    expect(fs.runRef.update).toHaveBeenCalledTimes(1);
    const happyUpdate = fs.runRef.update.mock.calls[0]![0];
    expect(happyUpdate).toEqual({
      enqueueMode: 'cloud-tasks',
      updatedAt: SERVER_TS_SENTINEL,
    });
    // Crucially: no status change on success.
    expect(happyUpdate).not.toHaveProperty('status');
  });

  it('reuses the existing project doc when one already matches repoUrl', async () => {
    const fs = makeFirestoreMock({
      projectExists: true,
      existingProjectId: 'proj-existing-7',
      runId: 'run-reuse-1',
    });
    getAdminFirestoreMock.mockReturnValue(fs.db);

    const { createAuditRun } = await import('./create-audit-run');
    const result = await createAuditRun(
      { repoUrl: 'https://github.com/octo/hello' },
      { ownerId: 'user-2' },
    );

    expect(result.projectId).toBe('proj-existing-7');

    // Existing project → update (not set).
    expect(fs.batchUpdate).toHaveBeenCalledTimes(1);
    // Only the run is set (project is updated).
    expect(fs.batchSet).toHaveBeenCalledTimes(1);
    expect(fs.batchCommit).toHaveBeenCalledTimes(1);

    // projectsCol.doc('proj-existing-7') was invoked to build the update ref.
    expect(fs.projectsCol.doc).toHaveBeenCalledWith('proj-existing-7');
  });

  it('rejects prdText larger than 200KB before touching Firestore', async () => {
    const fs = makeFirestoreMock({ projectExists: false });
    getAdminFirestoreMock.mockReturnValue(fs.db);

    const tooLarge = 'x'.repeat(200_001);

    const { createAuditRun } = await import('./create-audit-run');
    // W2-A: 200KB 안전망보다 먼저 50KB 사용자 cap 이 발사된다 → PrdTextTooLargeError.
    // 본 케이스는 "200KB 안전망 회귀 가드" 의도 — error class 와 무관하게
    // Firestore 미접근 + enqueue 미호출만 보존되면 된다.
    await expect(
      createAuditRun(
        { repoUrl: 'https://github.com/octo/hello', prdText: tooLarge },
        { ownerId: 'user-1' },
      ),
    ).rejects.toThrow(/prdText/);

    // Nothing should have been written.
    expect(fs.db.collection).not.toHaveBeenCalled();
    expect(fs.batchCommit).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  // W2-A: 50KB user cap 경계값 — 정확히 50_000 bytes 는 정상 통과해야 한다.
  // 50KB 한도가 inclusive(<= 50000) 인지 회귀 잠금. ASCII 'x' 1바이트 = 1 char.
  it('accepts prdText at exactly the 50_000-byte user cap boundary', async () => {
    const fs = makeFirestoreMock({ projectExists: false, runId: 'run-50kb-1' });
    getAdminFirestoreMock.mockReturnValue(fs.db);

    const atCap = 'x'.repeat(50_000);

    const { createAuditRun } = await import('./create-audit-run');
    const result = await createAuditRun(
      { repoUrl: 'https://github.com/octo/hello', prdText: atCap },
      { ownerId: 'user-cap' },
    );

    expect(result.auditRunId).toBe('run-50kb-1');
    // Run doc persisted the trimmed prdText verbatim (no truncation).
    const runSetCall = fs.batchSet.mock.calls[1]!;
    expect((runSetCall[1] as { prdText: string }).prdText).toBe(atCap);
    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({ prdText: atCap }),
    );
  });

  // W2-A: 50_001 bytes → PrdTextTooLargeError + actualBytes 정확 노출.
  // route handler 가 422 매핑 시 details.actualBytes 를 그대로 forwarding 하므로
  // 정확한 바이트 수 보존이 SLA.
  it('throws PrdTextTooLargeError when prdText is one byte over the 50KB cap', async () => {
    const fs = makeFirestoreMock({ projectExists: false });
    getAdminFirestoreMock.mockReturnValue(fs.db);

    const overCap = 'x'.repeat(50_001);

    const { createAuditRun, PrdTextTooLargeError, PRD_TEXT_USER_MAX_BYTES } =
      await import('./create-audit-run');
    expect(PRD_TEXT_USER_MAX_BYTES).toBe(50_000);

    let caught: unknown;
    try {
      await createAuditRun(
        { repoUrl: 'https://github.com/octo/hello', prdText: overCap },
        { ownerId: 'user-over' },
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(PrdTextTooLargeError);
    expect((caught as InstanceType<typeof PrdTextTooLargeError>).actualBytes).toBe(50_001);
    expect((caught as InstanceType<typeof PrdTextTooLargeError>).maxBytes).toBe(50_000);

    // Guardrail fires BEFORE any Firestore side effect or enqueue.
    expect(fs.db.collection).not.toHaveBeenCalled();
    expect(fs.batchCommit).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  // W2-A: 빈 문자열 / whitespace-only prdText 는 null 로 fold (SSOT).
  // step04c 가 빈 문자열을 sources 에 포함시켜 false-positive 분석을 만들지
  // 않도록 null 정규화가 단일 분기점이라는 회귀 가드.
  it('normalizes empty / whitespace-only prdText to null in the run doc + enqueue payload', async () => {
    const fs = makeFirestoreMock({ projectExists: false, runId: 'run-blank-1' });
    getAdminFirestoreMock.mockReturnValue(fs.db);

    const { createAuditRun } = await import('./create-audit-run');
    await createAuditRun(
      { repoUrl: 'https://github.com/octo/hello', prdText: '   \n\t  ' },
      { ownerId: 'user-blank' },
    );

    const runSetCall = fs.batchSet.mock.calls[1]!;
    expect((runSetCall[1] as { prdText: unknown }).prdText).toBeNull();
    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({ prdText: null }),
    );
  });

  it('flips run to FAILED and re-throws when enqueue rejects', async () => {
    const fs = makeFirestoreMock({ projectExists: false, runId: 'run-failed-1' });
    getAdminFirestoreMock.mockReturnValue(fs.db);
    const enqueueErr = new Error('Cloud Tasks permission denied');
    enqueueMock.mockRejectedValueOnce(enqueueErr);

    const { createAuditRun } = await import('./create-audit-run');
    await expect(
      createAuditRun(
        { repoUrl: 'https://github.com/octo/hello' },
        { ownerId: 'user-3' },
      ),
    ).rejects.toBe(enqueueErr);

    expect(fs.runRef.update).toHaveBeenCalledTimes(1);
    const updateCall = fs.runRef.update.mock.calls[0]![0];
    expect(updateCall).toMatchObject({
      status: 'FAILED',
      errorMessage: 'Enqueue failed: Cloud Tasks permission denied',
      // enqueueMode is explicitly nulled on failure — the dispatch route is
      // unknown because enqueueAuditTask never returned a result.
      enqueueMode: null,
      completedAt: SERVER_TS_SENTINEL,
      updatedAt: SERVER_TS_SENTINEL,
    });

    // The batch commit (which writes the original PENDING doc) still ran;
    // we don't want to leave dangling project state behind.
    expect(fs.batchCommit).toHaveBeenCalledTimes(1);
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('logs to stderr when the FAILED-mark write itself fails, and still re-throws enqueue error', async () => {
    const fs = makeFirestoreMock({ projectExists: false, runId: 'run-double-fail-1' });
    fs.runRef.update.mockRejectedValueOnce(new Error('firestore offline'));
    getAdminFirestoreMock.mockReturnValue(fs.db);
    const enqueueErr = new Error('worker unreachable');
    enqueueMock.mockRejectedValueOnce(enqueueErr);

    const { createAuditRun } = await import('./create-audit-run');
    await expect(
      createAuditRun(
        { repoUrl: 'https://github.com/octo/hello' },
        { ownerId: 'user-4' },
      ),
    ).rejects.toBe(enqueueErr);

    // Both writes attempted.
    expect(fs.runRef.update).toHaveBeenCalledTimes(1);
    expect(stderrSpy).toHaveBeenCalledTimes(1);

    const logLine = String(stderrSpy.mock.calls[0]![0]);
    const parsed = JSON.parse(logLine.trim());
    expect(parsed).toMatchObject({
      level: 'error',
      component: 'create-audit-run',
      message: 'Failed to mark AuditRun as FAILED after enqueue error',
      runId: 'run-double-fail-1',
      markError: 'firestore offline',
    });
  });

  it('updates the run exactly once on success, carrying enqueueMode but not status', async () => {
    const fs = makeFirestoreMock({ projectExists: true });
    getAdminFirestoreMock.mockReturnValue(fs.db);

    const { createAuditRun } = await import('./create-audit-run');
    await createAuditRun(
      { repoUrl: 'https://github.com/octo/hello' },
      { ownerId: 'user-5' },
    );

    // Exactly one post-commit update, with enqueueMode and updatedAt only.
    expect(fs.runRef.update).toHaveBeenCalledTimes(1);
    const payload = fs.runRef.update.mock.calls[0]![0];
    expect(payload).toEqual({
      enqueueMode: 'cloud-tasks',
      updatedAt: SERVER_TS_SENTINEL,
    });
    // Status must NOT be reasserted on the success update — the worker owns it.
    expect(payload).not.toHaveProperty('status');
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("persists enqueueMode 'direct-worker' verbatim when running in dev-direct mode", async () => {
    const fs = makeFirestoreMock({ projectExists: false, runId: 'run-direct-1' });
    getAdminFirestoreMock.mockReturnValue(fs.db);
    enqueueMock.mockResolvedValueOnce({
      mode: 'direct-worker',
      taskName: 'dev-direct-run-direct-1-123',
    });

    const { createAuditRun } = await import('./create-audit-run');
    await createAuditRun(
      { repoUrl: 'https://github.com/octo/hello' },
      { ownerId: 'user-direct' },
    );

    expect(fs.runRef.update).toHaveBeenCalledTimes(1);
    expect(fs.runRef.update.mock.calls[0]![0]).toEqual({
      enqueueMode: 'direct-worker',
      updatedAt: SERVER_TS_SENTINEL,
    });
  });

  it('throws PerIpRateLimitError and writes nothing when the per-IP cap is reached', async () => {
    // T1.1a cost guardrail: reserveIpSlot denies → createAuditRun must throw
    // BEFORE the daily-quota check or any Firestore writes/enqueue.
    const fs = makeFirestoreMock({ projectExists: false });
    getAdminFirestoreMock.mockReturnValue(fs.db);
    reserveIpSlotMock.mockResolvedValueOnce({
      ipKey: '1.2.3.4',
      bucketId: '2026-05-17T11:30',
      count: 10,
      max: 10,
      allowed: false,
      retryAfterSeconds: 42,
    });

    const { createAuditRun, PerIpRateLimitError } = await import('./create-audit-run');
    await expect(
      createAuditRun(
        { repoUrl: 'https://github.com/octo/hello' },
        { ownerId: 'user-ip', clientIp: '1.2.3.4' },
      ),
    ).rejects.toBeInstanceOf(PerIpRateLimitError);

    // Per-IP denial fires BEFORE the daily-quota check — the daily counter
    // must not be burned on an abusive client, and no Firestore docs created.
    expect(reserveDailyQuotaSlotMock).not.toHaveBeenCalled();
    expect(fs.db.collection).not.toHaveBeenCalled();
    expect(fs.batchCommit).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('passes the raw clientIp through to reserveIpSlot (allow path)', async () => {
    const fs = makeFirestoreMock({ projectExists: false });
    getAdminFirestoreMock.mockReturnValue(fs.db);

    const { createAuditRun } = await import('./create-audit-run');
    await createAuditRun(
      { repoUrl: 'https://github.com/octo/hello' },
      { ownerId: 'user-ip', clientIp: '203.0.113.7' },
    );

    expect(reserveIpSlotMock).toHaveBeenCalledTimes(1);
    expect(reserveIpSlotMock).toHaveBeenCalledWith('203.0.113.7');
  });

  it('throws DailyQuotaExceededError and writes nothing when the global cap is reached', async () => {
    // T1.1c cost guardrail: reserveDailyQuotaSlot denies → createAuditRun must
    // throw before touching Firestore. No project/run docs, no enqueue call.
    const fs = makeFirestoreMock({ projectExists: false });
    getAdminFirestoreMock.mockReturnValue(fs.db);
    reserveDailyQuotaSlotMock.mockResolvedValueOnce({
      bucketId: '2026-05-17',
      count: 1000,
      max: 1000,
      allowed: false,
    });

    const { createAuditRun, DailyQuotaExceededError } = await import('./create-audit-run');
    await expect(
      createAuditRun(
        { repoUrl: 'https://github.com/octo/hello' },
        { ownerId: 'user-quota' },
      ),
    ).rejects.toBeInstanceOf(DailyQuotaExceededError);

    // Nothing should have been written or enqueued — the guardrail must reject
    // BEFORE any Firestore side effect to avoid stranded Project/AuditRun docs.
    expect(fs.db.collection).not.toHaveBeenCalled();
    expect(fs.batchCommit).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("persists enqueueMode 'stub' verbatim when Cloud Tasks env is unconfigured", async () => {
    const fs = makeFirestoreMock({ projectExists: false, runId: 'run-stub-1' });
    getAdminFirestoreMock.mockReturnValue(fs.db);
    enqueueMock.mockResolvedValueOnce({
      mode: 'stub',
      taskName: 'stub-task-run-stub-1-123',
    });

    const { createAuditRun } = await import('./create-audit-run');
    await createAuditRun(
      { repoUrl: 'https://github.com/octo/hello' },
      { ownerId: 'user-stub' },
    );

    expect(fs.runRef.update).toHaveBeenCalledTimes(1);
    expect(fs.runRef.update.mock.calls[0]![0]).toEqual({
      enqueueMode: 'stub',
      updatedAt: SERVER_TS_SENTINEL,
    });
  });

  // T2.5: re-audit auto-mapping. The helper queries the latest COMPLETED
  // AuditRun for (ownerId, repoUrl) and the result lands on the new run's
  // `previousRunId` field. Field absent on first audit; present on re-audit;
  // helper failure must not block creation.
  describe('previousRunId (re-audit linkage)', () => {
    it('omits previousRunId on the first audit of a repo', async () => {
      const fs = makeFirestoreMock({ projectExists: false, runId: 'run-first-1' });
      getAdminFirestoreMock.mockReturnValue(fs.db);

      const { createAuditRun } = await import('./create-audit-run');
      await createAuditRun(
        { repoUrl: 'https://github.com/octo/hello' },
        { ownerId: 'user-first' },
      );

      // batchSet calls: [0] project, [1] run.
      const runSetCall = fs.batchSet.mock.calls[1]!;
      const runDoc = runSetCall[1] as Record<string, unknown>;
      expect(runDoc).not.toHaveProperty('previousRunId');
    });

    it('stamps previousRunId from the latest COMPLETED run on re-audit', async () => {
      const fs = makeFirestoreMock({ projectExists: true, runId: 'run-reaudit-1' });
      getAdminFirestoreMock.mockReturnValue(fs.db);
      fs.previousRunQuery.get.mockResolvedValueOnce({
        empty: false,
        docs: [{ id: 'run-prev-abc' }],
      });

      const { createAuditRun } = await import('./create-audit-run');
      await createAuditRun(
        { repoUrl: 'https://github.com/octo/hello' },
        { ownerId: 'user-reaudit' },
      );

      // Query was constructed against (ownerId, repoUrl, status=COMPLETED).
      expect(fs.previousRunQuery.where).toHaveBeenCalledWith('ownerId', '==', 'user-reaudit');
      expect(fs.previousRunQuery.where).toHaveBeenCalledWith(
        'repoUrl',
        '==',
        'https://github.com/octo/hello',
      );
      expect(fs.previousRunQuery.where).toHaveBeenCalledWith('status', '==', 'COMPLETED');
      expect(fs.previousRunQuery.orderBy).toHaveBeenCalledWith('completedAt', 'desc');
      expect(fs.previousRunQuery.limit).toHaveBeenCalledWith(1);

      const runSetCall = fs.batchSet.mock.calls.find(
        (c) => (c[1] as Record<string, unknown>).status === 'PENDING',
      )!;
      const runDoc = runSetCall[1] as Record<string, unknown>;
      expect(runDoc.previousRunId).toBe('run-prev-abc');
    });

    it('still creates the run when previous-run lookup throws (omits field)', async () => {
      const fs = makeFirestoreMock({ projectExists: false, runId: 'run-graceful-1' });
      getAdminFirestoreMock.mockReturnValue(fs.db);
      // Simulate missing-composite-index or IAM failure — helper must swallow
      // and return undefined so the audit isn't blocked.
      fs.previousRunQuery.get.mockRejectedValueOnce(
        new Error('FAILED_PRECONDITION: missing index'),
      );

      const { createAuditRun } = await import('./create-audit-run');
      const result = await createAuditRun(
        { repoUrl: 'https://github.com/octo/hello' },
        { ownerId: 'user-graceful' },
      );

      expect(result.auditRunId).toBe('run-graceful-1');
      const runSetCall = fs.batchSet.mock.calls[1]!;
      const runDoc = runSetCall[1] as Record<string, unknown>;
      expect(runDoc).not.toHaveProperty('previousRunId');
      // The helper logged a structured warning to stderr — exact shape lives
      // in resolve-previous-run.test (not under test here).
    });
  });
});
