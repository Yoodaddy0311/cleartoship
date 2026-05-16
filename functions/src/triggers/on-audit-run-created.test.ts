// Tests for the Firestore onCreate trigger that enqueues audit tasks.
//
// Strategy:
//   - Mock `firebase-functions/v2/firestore` so `onDocumentCreated` returns the
//     supplied handler verbatim — the test can invoke it directly with a
//     synthetic event.
//   - Mock `../lib/enqueue-audit-task.js` so we can assert payload shape and
//     toggle error paths without touching real Cloud Tasks.
//   - Stub env vars (FUNCTIONS_EMULATOR / CLOUD_TASKS_PROJECT / AUDIT_WORKER_URL)
//     in beforeEach and unstub in afterEach so tests stay independent.
//   - Each test imports the trigger module dynamically AFTER env is configured
//     because the module reads env at load-time and caches them in top-level
//     consts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const enqueueMock = vi.fn();
const handlerCapture: { fn: ((event: unknown) => Promise<void>) | null } = { fn: null };

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (_opts: unknown, handler: (event: unknown) => Promise<void>) => {
    handlerCapture.fn = handler;
    return handler;
  },
}));

vi.mock('../lib/enqueue-audit-task.js', () => ({
  enqueueAuditTask: enqueueMock,
}));

// Mock firebase-admin/firestore so `FieldValue.serverTimestamp()` resolves
// without bootstrapping the real Admin SDK. The trigger calls it when writing
// the enqueueMode update; we just need a sentinel the assertions can compare.
const SERVER_TIMESTAMP = Symbol('serverTimestamp');
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => SERVER_TIMESTAMP,
  },
}));

interface FakeEvent {
  params: { runId: string };
  data?: {
    data: () => Record<string, unknown> | undefined;
    ref: { update: ReturnType<typeof vi.fn> };
  };
}

// makeEvent now also stitches a mock DocumentReference onto `event.data.ref`
// so the trigger's post-enqueue `ref.update(...)` call can be asserted. Tests
// that don't care about the update can ignore `updateMock`; tests that do
// (the enqueueMode-persistence cases below) read it back via the returned
// object.
function makeEvent(
  runId: string,
  data?: Record<string, unknown>,
): FakeEvent & { updateMock: ReturnType<typeof vi.fn> } {
  // Use untyped `vi.fn()` so its inferred Mock signature matches the looser
  // `ReturnType<typeof vi.fn>` shape the FakeEvent interface expects. Typing
  // it as `vi.fn(async () => undefined)` narrows the return to `Promise<undefined>`
  // which vitest's Mock<any[], unknown> doesn't assign to.
  const updateMock = vi.fn();
  updateMock.mockResolvedValue(undefined);
  return {
    params: { runId },
    data:
      data === undefined
        ? undefined
        : { data: () => data, ref: { update: updateMock } },
    updateMock,
  };
}

const VALID_DATA = {
  ownerId: 'owner-1',
  projectId: 'proj-1',
  repoUrl: 'https://github.com/example/repo',
  deployUrl: 'https://example.com',
  prdText: 'PRD body',
};

// Snapshot of relevant env vars so we can restore between tests. The trigger
// reads env at import time, so we re-import the module in each test after
// configuring env to control which branch is taken.
const ENV_KEYS = [
  'FUNCTIONS_EMULATOR',
  'CLOUD_TASKS_PROJECT',
  'GCP_PROJECT',
  'AUDIT_WORKER_URL',
  'AUDIT_WORKER_INVOKER_SA',
  'CLOUD_TASKS_LOCATION',
  'CLOUD_TASKS_QUEUE',
] as const;

describe('onAuditRunCreated trigger', () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) original[k] = process.env[k];
    enqueueMock.mockReset();
    handlerCapture.fn = null;
    vi.resetModules();
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
    vi.restoreAllMocks();
  });

  async function loadTrigger() {
    const mod = await import('./on-audit-run-created.js');
    // Side-effect: importing registers the handler via onDocumentCreated mock.
    return mod;
  }

  it('production: invokes enqueueAuditTask with correctly-shaped payload', async () => {
    process.env.FUNCTIONS_EMULATOR = 'false';
    process.env.CLOUD_TASKS_PROJECT = 'demo';
    process.env.AUDIT_WORKER_URL = 'https://worker.example.com';
    process.env.AUDIT_WORKER_INVOKER_SA = 'invoker@demo.iam.gserviceaccount.com';
    enqueueMock.mockResolvedValueOnce({
      taskName: 'projects/demo/locations/asia-northeast3/queues/audit-jobs/tasks/audit-run-1',
      deduped: false,
    });

    await loadTrigger();
    expect(handlerCapture.fn).not.toBeNull();
    await handlerCapture.fn!(makeEvent('run-1', VALID_DATA));

    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const [payload, config] = enqueueMock.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(payload).toEqual({
      runId: 'run-1',
      projectId: 'proj-1',
      ownerId: 'owner-1',
      repoUrl: 'https://github.com/example/repo',
      deployUrl: 'https://example.com',
      prdText: 'PRD body',
      commitHash: null,
    });
    expect(config.project).toBe('demo');
    expect(config.workerUrl).toBe('https://worker.example.com');
    expect(config.invokerSa).toBe('invoker@demo.iam.gserviceaccount.com');
  });

  it('emulator: takes the emulator branch even when CLOUD_TASKS_PROJECT is unset', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    delete process.env.CLOUD_TASKS_PROJECT;
    delete process.env.GCP_PROJECT;
    process.env.AUDIT_WORKER_URL = 'https://worker.local';
    enqueueMock.mockResolvedValueOnce({
      taskName: 'dev-direct-run-2-xyz',
      deduped: false,
    });

    await loadTrigger();
    await handlerCapture.fn!(makeEvent('run-2', VALID_DATA));

    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const [, config] = enqueueMock.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(config.project).toBe(''); // empty in emulator mode
    expect(config.workerUrl).toBe('https://worker.local');
  });

  it('production without CLOUD_TASKS_PROJECT: skips enqueue (does NOT call helper)', async () => {
    process.env.FUNCTIONS_EMULATOR = 'false';
    delete process.env.CLOUD_TASKS_PROJECT;
    delete process.env.GCP_PROJECT;
    process.env.AUDIT_WORKER_URL = 'https://worker.example.com';

    await loadTrigger();
    await handlerCapture.fn!(makeEvent('run-3', VALID_DATA));

    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('missing AUDIT_WORKER_URL: skips enqueue regardless of mode', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    delete process.env.AUDIT_WORKER_URL;

    await loadTrigger();
    await handlerCapture.fn!(makeEvent('run-4', VALID_DATA));

    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('missing required fields (no ownerId): does not enqueue', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    process.env.AUDIT_WORKER_URL = 'https://worker.local';

    await loadTrigger();
    await handlerCapture.fn!(
      makeEvent('run-5', { projectId: 'p', repoUrl: 'https://github.com/x/y' }),
    );

    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('empty snapshot data: returns early without throwing', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    process.env.AUDIT_WORKER_URL = 'https://worker.local';

    await loadTrigger();
    await expect(handlerCapture.fn!(makeEvent('run-6', undefined))).resolves.toBeUndefined();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('omits optional deployUrl/prdText as null when absent', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    process.env.AUDIT_WORKER_URL = 'https://worker.local';
    enqueueMock.mockResolvedValueOnce({ taskName: 'name', deduped: false });

    await loadTrigger();
    await handlerCapture.fn!(
      makeEvent('run-7', {
        ownerId: 'o',
        projectId: 'p',
        repoUrl: 'https://github.com/x/y',
      }),
    );

    const [payload] = enqueueMock.mock.calls[0] as [Record<string, unknown>];
    expect(payload.deployUrl).toBeNull();
    expect(payload.prdText).toBeNull();
    expect(payload.commitHash).toBeNull();
  });

  it('enqueue helper throws: error is re-thrown to surface to retry policy', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    process.env.AUDIT_WORKER_URL = 'https://worker.local';
    enqueueMock.mockRejectedValueOnce(new Error('cloud tasks boom'));
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    await loadTrigger();
    await expect(handlerCapture.fn!(makeEvent('run-8', VALID_DATA))).rejects.toThrow(
      'cloud tasks boom',
    );

    // Error path should log at least once before re-throwing.
    expect(stderrSpy).toHaveBeenCalled();
    stderrSpy.mockRestore();
  });

  it('deduped result logs the dedupe message (no throw)', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    process.env.AUDIT_WORKER_URL = 'https://worker.local';
    enqueueMock.mockResolvedValueOnce({ taskName: 'name', deduped: true });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    await loadTrigger();
    await handlerCapture.fn!(makeEvent('run-9', VALID_DATA));

    const logged = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(logged).toContain('already enqueued');
    stderrSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // enqueueMode persistence (Task J — symmetry with direct API path).
  // The trigger writes back the dispatch route onto the AuditRun doc so the
  // read side can tell which path handled the run. These cases exercise the
  // three branches (cloud-tasks / direct-worker / stub) plus the idempotency
  // guard that prevents double-enqueue when the direct API path raced ahead.
  // -------------------------------------------------------------------------

  it('persists enqueueMode = "cloud-tasks" on production enqueue success', async () => {
    process.env.FUNCTIONS_EMULATOR = 'false';
    process.env.CLOUD_TASKS_PROJECT = 'demo';
    process.env.AUDIT_WORKER_URL = 'https://worker.example.com';
    enqueueMock.mockResolvedValueOnce({
      taskName: 'projects/demo/locations/asia-northeast3/queues/audit-jobs/tasks/audit-run-ct',
      deduped: false,
    });

    await loadTrigger();
    const event = makeEvent('run-ct', VALID_DATA);
    await handlerCapture.fn!(event);

    expect(event.updateMock).toHaveBeenCalledTimes(1);
    const updatePayload = event.updateMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(updatePayload.enqueueMode).toBe('cloud-tasks');
    // serverTimestamp() must be attached so the converter sees a fresh
    // updatedAt — we mocked it to a sentinel symbol above.
    expect(updatePayload.updatedAt).toBeTypeOf('symbol');
  });

  it('persists enqueueMode = "direct-worker" on emulator/dev enqueue success', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    delete process.env.CLOUD_TASKS_PROJECT;
    delete process.env.GCP_PROJECT;
    process.env.AUDIT_WORKER_URL = 'https://worker.local';
    enqueueMock.mockResolvedValueOnce({
      taskName: 'dev-direct-run-dw-xyz',
      deduped: false,
    });

    await loadTrigger();
    const event = makeEvent('run-dw', VALID_DATA);
    await handlerCapture.fn!(event);

    expect(event.updateMock).toHaveBeenCalledTimes(1);
    const updatePayload = event.updateMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(updatePayload.enqueueMode).toBe('direct-worker');
  });

  it('persists enqueueMode = "stub" when AUDIT_WORKER_URL is unset (skipped enqueue)', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    delete process.env.AUDIT_WORKER_URL;

    await loadTrigger();
    const event = makeEvent('run-stub', VALID_DATA);
    await handlerCapture.fn!(event);

    // Helper must NOT be called in the stub branch — the env pre-check is
    // what determines this; the helper would have to be invoked to even
    // attempt a real dispatch.
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(event.updateMock).toHaveBeenCalledTimes(1);
    const updatePayload = event.updateMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(updatePayload.enqueueMode).toBe('stub');
  });

  it('persists enqueueMode = "stub" when production has no CLOUD_TASKS_PROJECT', async () => {
    process.env.FUNCTIONS_EMULATOR = 'false';
    delete process.env.CLOUD_TASKS_PROJECT;
    delete process.env.GCP_PROJECT;
    process.env.AUDIT_WORKER_URL = 'https://worker.example.com';

    await loadTrigger();
    const event = makeEvent('run-stub-prod', VALID_DATA);
    await handlerCapture.fn!(event);

    expect(enqueueMock).not.toHaveBeenCalled();
    expect(event.updateMock).toHaveBeenCalledTimes(1);
    expect(event.updateMock.mock.calls[0]![0]).toMatchObject({ enqueueMode: 'stub' });
  });

  it('idempotency: when enqueueMode is already set, does NOT enqueue or update', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    process.env.AUDIT_WORKER_URL = 'https://worker.local';

    await loadTrigger();
    const event = makeEvent('run-already', {
      ...VALID_DATA,
      // Simulates the direct API path having raced ahead and stamped the run.
      enqueueMode: 'cloud-tasks',
    });
    await handlerCapture.fn!(event);

    expect(enqueueMock).not.toHaveBeenCalled();
    expect(event.updateMock).not.toHaveBeenCalled();
  });

  it('idempotency: null enqueueMode is treated as "not set" and trigger proceeds', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    process.env.AUDIT_WORKER_URL = 'https://worker.local';
    enqueueMock.mockResolvedValueOnce({ taskName: 'name', deduped: false });

    await loadTrigger();
    const event = makeEvent('run-null', { ...VALID_DATA, enqueueMode: null });
    await handlerCapture.fn!(event);

    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(event.updateMock).toHaveBeenCalledTimes(1);
    expect(event.updateMock.mock.calls[0]![0]).toMatchObject({ enqueueMode: 'direct-worker' });
  });

  it('persistEnqueueMode failure is swallowed (does not re-throw from handler)', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    process.env.AUDIT_WORKER_URL = 'https://worker.local';
    enqueueMock.mockResolvedValueOnce({ taskName: 'name', deduped: false });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    await loadTrigger();
    const event = makeEvent('run-update-fail', VALID_DATA);
    event.updateMock.mockRejectedValueOnce(new Error('firestore offline'));

    // The enqueue itself succeeded; failing to label the doc must not poison
    // the handler — otherwise Functions retries and we risk double dispatch.
    await expect(handlerCapture.fn!(event)).resolves.toBeUndefined();
    const logged = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(logged).toContain('Failed to persist enqueueMode');
    stderrSpy.mockRestore();
  });
});
