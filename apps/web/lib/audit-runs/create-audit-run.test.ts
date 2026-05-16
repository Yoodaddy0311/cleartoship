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

const { getAdminFirestoreMock, enqueueMock, parseGitHubUrlMock, parseDeployUrlMock } =
  vi.hoisted(() => ({
    getAdminFirestoreMock: vi.fn(),
    enqueueMock: vi.fn(),
    parseGitHubUrlMock: vi.fn(),
    parseDeployUrlMock: vi.fn(),
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

  const runsCol = {
    doc: vi.fn(() => runRef),
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
    await expect(
      createAuditRun(
        { repoUrl: 'https://github.com/octo/hello', prdText: tooLarge },
        { ownerId: 'user-1' },
      ),
    ).rejects.toThrow(/prdText too large/);

    // Nothing should have been written.
    expect(fs.db.collection).not.toHaveBeenCalled();
    expect(fs.batchCommit).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
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
});
