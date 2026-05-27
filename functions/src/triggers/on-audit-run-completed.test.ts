// Tests for the Firestore onUpdate trigger that fires the enrichment-worker
// Cloud Run job when an AuditRun transitions to COMPLETED with aiEnhanced.
//
// Strategy (mirrors on-audit-run-created.test.ts):
//   - Mock `firebase-functions/v2/firestore` so `onDocumentUpdated` returns the
//     supplied handler verbatim — the test invokes it directly with a synthetic
//     before/after event.
//   - Mock `@google-cloud/run` so JobsClient.runJob is a controllable spy; no
//     real GCP auth or network.
//   - Stub env vars (FUNCTIONS_EMULATOR / CLOUD_TASKS_PROJECT / GCP_PROJECT /
//     CLOUD_TASKS_LOCATION / ENRICHMENT_JOB_NAME) in beforeEach and restore in
//     afterEach so tests stay independent.
//   - Each test imports the trigger module dynamically AFTER env is configured
//     because the module reads env at load-time into top-level consts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runJobMock = vi.fn();
const handlerCapture: { fn: ((event: unknown) => Promise<void>) | null } = { fn: null };

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentUpdated: (_opts: unknown, handler: (event: unknown) => Promise<void>) => {
    handlerCapture.fn = handler;
    return handler;
  },
}));

vi.mock('@google-cloud/run', () => ({
  JobsClient: class {
    runJob = runJobMock;
  },
}));

interface FakeUpdateEvent {
  params: { runId: string };
  data?: {
    before?: { data: () => Record<string, unknown> | undefined };
    after?: { data: () => Record<string, unknown> | undefined };
  };
}

// Build a synthetic onUpdate event. `after === undefined` models a deletion /
// empty post-image; `before === undefined` models a first-seen doc.
function makeEvent(
  runId: string,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): FakeUpdateEvent {
  return {
    params: { runId },
    data: {
      before: before === undefined ? undefined : { data: () => before },
      after: after === undefined ? undefined : { data: () => after },
    },
  };
}

const ENV_KEYS = [
  'FUNCTIONS_EMULATOR',
  'CLOUD_TASKS_PROJECT',
  'GCP_PROJECT',
  'CLOUD_TASKS_LOCATION',
  'ENRICHMENT_JOB_NAME',
] as const;

describe('onAuditRunCompleted trigger', () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) original[k] = process.env[k];
    runJobMock.mockReset();
    runJobMock.mockResolvedValue([{ name: 'op-1' }]);
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
    // Side-effect: importing registers the handler via the onDocumentUpdated mock.
    return import('./on-audit-run-completed.js');
  }

  it('fires the job on PENDING→COMPLETED transition with aiEnhanced=true', async () => {
    process.env.CLOUD_TASKS_PROJECT = 'demo';
    process.env.CLOUD_TASKS_LOCATION = 'asia-northeast3';

    await loadTrigger();
    expect(handlerCapture.fn).not.toBeNull();
    await handlerCapture.fn!(
      makeEvent(
        'run-1',
        { status: 'PENDING', aiEnhanced: true },
        { status: 'COMPLETED', aiEnhanced: true },
      ),
    );

    expect(runJobMock).toHaveBeenCalledTimes(1);
    const arg = runJobMock.mock.calls[0]![0] as {
      name: string;
      overrides: { containerOverrides: { env: { name: string; value: string }[] }[] };
    };
    expect(arg.name).toBe('projects/demo/locations/asia-northeast3/jobs/enrichment-worker');
    expect(arg.overrides.containerOverrides[0]!.env).toEqual([
      { name: 'RUN_ID', value: 'run-1' },
    ]);
  });

  it('fires the job on RUNNING→COMPLETED transition with aiEnhanced=true', async () => {
    process.env.CLOUD_TASKS_PROJECT = 'demo';

    await loadTrigger();
    await handlerCapture.fn!(
      makeEvent(
        'run-running',
        { status: 'RUNNING', aiEnhanced: true },
        { status: 'COMPLETED', aiEnhanced: true },
      ),
    );

    expect(runJobMock).toHaveBeenCalledTimes(1);
    const arg = runJobMock.mock.calls[0]![0] as { name: string };
    expect(arg.name).toContain('/jobs/enrichment-worker');
  });

  it('does NOT fire when aiEnhanced is falsy', async () => {
    process.env.CLOUD_TASKS_PROJECT = 'demo';

    await loadTrigger();
    await handlerCapture.fn!(
      makeEvent(
        'run-2',
        { status: 'RUNNING', aiEnhanced: false },
        { status: 'COMPLETED', aiEnhanced: false },
      ),
    );

    expect(runJobMock).not.toHaveBeenCalled();
  });

  it('does NOT fire when aiEnhanced is absent', async () => {
    process.env.CLOUD_TASKS_PROJECT = 'demo';

    await loadTrigger();
    await handlerCapture.fn!(
      makeEvent('run-2b', { status: 'RUNNING' }, { status: 'COMPLETED' }),
    );

    expect(runJobMock).not.toHaveBeenCalled();
  });

  it('does NOT fire when before was already COMPLETED (no transition)', async () => {
    process.env.CLOUD_TASKS_PROJECT = 'demo';

    await loadTrigger();
    await handlerCapture.fn!(
      makeEvent(
        'run-3',
        { status: 'COMPLETED', aiEnhanced: true },
        // A later metadata update — e.g. the job writing report.enrichment back.
        { status: 'COMPLETED', aiEnhanced: true, report: { enrichment: {} } },
      ),
    );

    expect(runJobMock).not.toHaveBeenCalled();
  });

  it('does NOT fire when after.status is not COMPLETED', async () => {
    process.env.CLOUD_TASKS_PROJECT = 'demo';

    await loadTrigger();
    await handlerCapture.fn!(
      makeEvent(
        'run-4',
        { status: 'PENDING', aiEnhanced: true },
        { status: 'RUNNING', aiEnhanced: true },
      ),
    );

    expect(runJobMock).not.toHaveBeenCalled();
  });

  it('passes RUN_ID as the container override env', async () => {
    process.env.CLOUD_TASKS_PROJECT = 'demo';

    await loadTrigger();
    await handlerCapture.fn!(
      makeEvent(
        'run-override',
        { status: 'PENDING', aiEnhanced: true },
        { status: 'COMPLETED', aiEnhanced: true },
      ),
    );

    const arg = runJobMock.mock.calls[0]![0] as {
      overrides: { containerOverrides: { env: { name: string; value: string }[] }[] };
    };
    expect(arg.overrides.containerOverrides[0]!.env[0]).toEqual({
      name: 'RUN_ID',
      value: 'run-override',
    });
  });

  it('honors a custom ENRICHMENT_JOB_NAME', async () => {
    process.env.CLOUD_TASKS_PROJECT = 'demo';
    process.env.ENRICHMENT_JOB_NAME = 'enrichment-worker-staging';

    await loadTrigger();
    await handlerCapture.fn!(
      makeEvent(
        'run-custom-job',
        { status: 'RUNNING', aiEnhanced: true },
        { status: 'COMPLETED', aiEnhanced: true },
      ),
    );

    const arg = runJobMock.mock.calls[0]![0] as { name: string };
    expect(arg.name).toBe(
      'projects/demo/locations/asia-northeast3/jobs/enrichment-worker-staging',
    );
  });

  it('emulator / no project: logs stub and does NOT dispatch', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    delete process.env.CLOUD_TASKS_PROJECT;
    delete process.env.GCP_PROJECT;
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    await loadTrigger();
    await handlerCapture.fn!(
      makeEvent(
        'run-5',
        { status: 'RUNNING', aiEnhanced: true },
        { status: 'COMPLETED', aiEnhanced: true },
      ),
    );

    expect(runJobMock).not.toHaveBeenCalled();
    const logged = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(logged).toContain('skipping job dispatch');
    stderrSpy.mockRestore();
  });

  it('empty after-snapshot: returns early without throwing or dispatching', async () => {
    process.env.CLOUD_TASKS_PROJECT = 'demo';

    await loadTrigger();
    await expect(
      handlerCapture.fn!(makeEvent('run-6', { status: 'RUNNING', aiEnhanced: true }, undefined)),
    ).resolves.toBeUndefined();
    expect(runJobMock).not.toHaveBeenCalled();
  });

  it('first-seen COMPLETED (before undefined) still fires when aiEnhanced=true', async () => {
    process.env.CLOUD_TASKS_PROJECT = 'demo';

    await loadTrigger();
    await handlerCapture.fn!(
      makeEvent('run-7', undefined, { status: 'COMPLETED', aiEnhanced: true }),
    );

    expect(runJobMock).toHaveBeenCalledTimes(1);
  });

  it('runJob throws: error is re-thrown to surface to retry policy', async () => {
    process.env.CLOUD_TASKS_PROJECT = 'demo';
    runJobMock.mockRejectedValueOnce(new Error('run-job boom'));
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    await loadTrigger();
    await expect(
      handlerCapture.fn!(
        makeEvent(
          'run-8',
          { status: 'RUNNING', aiEnhanced: true },
          { status: 'COMPLETED', aiEnhanced: true },
        ),
      ),
    ).rejects.toThrow('run-job boom');

    const logged = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(logged).toContain('Failed to dispatch');
    stderrSpy.mockRestore();
  });
});

// Unit-test the pure decision function directly for exhaustive branch coverage.
describe('shouldFire', () => {
  // Imported lazily inside each assertion group so the module-level env reads
  // don't matter for this pure function.
  it('true only on transition→COMPLETED with aiEnhanced=true', async () => {
    const { shouldFire } = await import('./on-audit-run-completed.js');
    expect(
      shouldFire({ status: 'RUNNING', aiEnhanced: true }, { status: 'COMPLETED', aiEnhanced: true }),
    ).toBe(true);
    expect(
      shouldFire(undefined, { status: 'COMPLETED', aiEnhanced: true }),
    ).toBe(true);
  });

  it('false when not transitioning, not COMPLETED, or not aiEnhanced', async () => {
    const { shouldFire } = await import('./on-audit-run-completed.js');
    // already COMPLETED — no transition
    expect(
      shouldFire({ status: 'COMPLETED', aiEnhanced: true }, { status: 'COMPLETED', aiEnhanced: true }),
    ).toBe(false);
    // after not COMPLETED
    expect(
      shouldFire({ status: 'PENDING', aiEnhanced: true }, { status: 'RUNNING', aiEnhanced: true }),
    ).toBe(false);
    // not aiEnhanced
    expect(
      shouldFire({ status: 'RUNNING', aiEnhanced: false }, { status: 'COMPLETED', aiEnhanced: false }),
    ).toBe(false);
    // aiEnhanced absent
    expect(shouldFire({ status: 'RUNNING' }, { status: 'COMPLETED' })).toBe(false);
  });
});
