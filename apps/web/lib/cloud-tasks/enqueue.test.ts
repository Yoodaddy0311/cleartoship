// Unit tests for enqueueAuditTask — env-branch behaviour, dev fallback, dedupe.
// @google-cloud/tasks is mocked so we don't reach the network.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditTaskPayload } from '@cleartoship/shared-types';

const { createTaskMock } = vi.hoisted(() => ({ createTaskMock: vi.fn() }));

vi.mock('@google-cloud/tasks', () => ({
  CloudTasksClient: vi.fn().mockImplementation(() => ({
    createTask: createTaskMock,
  })),
}));

const PAYLOAD: AuditTaskPayload = {
  runId: 'run-1',
  projectId: 'proj-1',
  ownerId: 'user-1',
  repoUrl: 'https://github.com/owner/repo',
  deployUrl: null,
  prdText: null,
  commitHash: null,
};

const ENV_KEYS = [
  'CLOUD_TASKS_PROJECT',
  'CLOUD_TASKS_LOCATION',
  'CLOUD_TASKS_QUEUE',
  'AUDIT_WORKER_URL',
  'AUDIT_WORKER_INVOKER_SA',
  'NEXT_PUBLIC_USE_EMULATORS',
  'NODE_ENV',
] as const;

let originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

function clearEnv() {
  for (const k of ENV_KEYS) {
    delete process.env[k];
  }
}

beforeEach(() => {
  vi.resetModules();
  createTaskMock.mockReset();
  originalEnv = {};
  for (const k of ENV_KEYS) {
    originalEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearEnv();
  const mutableEnv = process.env as Record<string, string | undefined>;
  for (const k of ENV_KEYS) {
    const v = originalEnv[k];
    if (v !== undefined) mutableEnv[k] = v;
  }
});

describe('enqueueAuditTask — dev direct mode', () => {
  it('POSTs directly to worker when AUDIT_WORKER_URL set + NODE_ENV !== production', async () => {
    process.env.AUDIT_WORKER_URL = 'http://localhost:8080';
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { enqueueAuditTask } = await import('./enqueue');
    const result = await enqueueAuditTask(PAYLOAD);

    expect(result.taskName).toMatch(/^dev-direct-run-1-/);
    expect(result.enqueuedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Production-parity: fetch is now awaited — assert call already happened
    // before the function returned.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8080/run');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Dev-Mode']).toBe('1');
    expect(JSON.parse(init.body).runId).toBe('run-1');
  });

  it('returns mode="direct-worker" on dev-direct success', async () => {
    process.env.AUDIT_WORKER_URL = 'http://localhost:8080';
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { enqueueAuditTask } = await import('./enqueue');
    const result = await enqueueAuditTask(PAYLOAD);

    expect(result.mode).toBe('direct-worker');
  });

  it('strips trailing slashes from AUDIT_WORKER_URL', async () => {
    process.env.AUDIT_WORKER_URL = 'http://localhost:8080///';
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { enqueueAuditTask } = await import('./enqueue');
    await enqueueAuditTask(PAYLOAD);

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8080/run');
  });

  it('activates dev direct mode when NEXT_PUBLIC_USE_EMULATORS=1 even if NODE_ENV=production', async () => {
    process.env.AUDIT_WORKER_URL = 'http://emul:8080';
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_USE_EMULATORS = '1';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { enqueueAuditTask } = await import('./enqueue');
    const result = await enqueueAuditTask(PAYLOAD);

    expect(result.taskName).toMatch(/^dev-direct-/);
    expect(result.mode).toBe('direct-worker');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('throws when fetch rejects so caller can mark the run FAILED', async () => {
    process.env.AUDIT_WORKER_URL = 'http://localhost:8080';
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', fetchMock);

    const { enqueueAuditTask } = await import('./enqueue');
    await expect(enqueueAuditTask(PAYLOAD)).rejects.toThrow(/ECONNREFUSED/);
  });

  it('throws when worker responds non-2xx so caller can mark the run FAILED', async () => {
    process.env.AUDIT_WORKER_URL = 'http://localhost:8080';
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);

    const { enqueueAuditTask } = await import('./enqueue');
    await expect(enqueueAuditTask(PAYLOAD)).rejects.toThrow(/503/);
  });
});

describe('enqueueAuditTask — stub fallback', () => {
  it('returns a stub task name when neither queuePath nor workerUrl configured', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    const { enqueueAuditTask } = await import('./enqueue');

    const result = await enqueueAuditTask(PAYLOAD);

    expect(result.taskName).toMatch(/^stub-task-run-1-/);
    expect(result.mode).toBe('stub');
    expect(createTaskMock).not.toHaveBeenCalled();
  });

  it('returns a stub task name when queuePath is configured but AUDIT_WORKER_URL is missing', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    process.env.CLOUD_TASKS_PROJECT = 'proj';
    process.env.CLOUD_TASKS_LOCATION = 'loc';
    process.env.CLOUD_TASKS_QUEUE = 'q';
    // AUDIT_WORKER_URL intentionally missing.

    const { enqueueAuditTask } = await import('./enqueue');
    const result = await enqueueAuditTask(PAYLOAD);

    expect(result.taskName).toMatch(/^stub-task-/);
    expect(createTaskMock).not.toHaveBeenCalled();
  });
});

describe('enqueueAuditTask — Cloud Tasks production path', () => {
  function setProdEnv() {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    process.env.CLOUD_TASKS_PROJECT = 'proj';
    process.env.CLOUD_TASKS_LOCATION = 'us-central1';
    process.env.CLOUD_TASKS_QUEUE = 'audits';
    process.env.AUDIT_WORKER_URL = 'https://worker.example.com';
  }

  it('calls CloudTasksClient.createTask with deterministic task name and base64 body', async () => {
    setProdEnv();
    createTaskMock.mockResolvedValue([{ name: 'projects/proj/locations/us-central1/queues/audits/tasks/audit-run-1' }]);

    const { enqueueAuditTask } = await import('./enqueue');
    const result = await enqueueAuditTask(PAYLOAD);

    expect(createTaskMock).toHaveBeenCalledTimes(1);
    const arg = createTaskMock.mock.calls[0][0];
    expect(arg.parent).toBe('projects/proj/locations/us-central1/queues/audits');
    expect(arg.task.name).toBe(
      'projects/proj/locations/us-central1/queues/audits/tasks/audit-run-1',
    );
    expect(arg.task.httpRequest.url).toBe('https://worker.example.com/run');
    const decoded = JSON.parse(
      Buffer.from(arg.task.httpRequest.body, 'base64').toString('utf-8'),
    );
    expect(decoded.runId).toBe('run-1');
    expect(result.taskName).toContain('audit-run-1');
    expect(result.mode).toBe('cloud-tasks');
  });

  it('includes oidcToken when AUDIT_WORKER_INVOKER_SA is set', async () => {
    setProdEnv();
    process.env.AUDIT_WORKER_INVOKER_SA = 'invoker@proj.iam.gserviceaccount.com';
    createTaskMock.mockResolvedValue([{ name: 'task-1' }]);

    const { enqueueAuditTask } = await import('./enqueue');
    await enqueueAuditTask(PAYLOAD);

    const arg = createTaskMock.mock.calls[0][0];
    expect(arg.task.httpRequest.oidcToken).toEqual({
      serviceAccountEmail: 'invoker@proj.iam.gserviceaccount.com',
      audience: 'https://worker.example.com',
    });
  });

  it('omits oidcToken when AUDIT_WORKER_INVOKER_SA is unset', async () => {
    setProdEnv();
    createTaskMock.mockResolvedValue([{ name: 'task-1' }]);

    const { enqueueAuditTask } = await import('./enqueue');
    await enqueueAuditTask(PAYLOAD);

    const arg = createTaskMock.mock.calls[0][0];
    expect(arg.task.httpRequest.oidcToken).toBeUndefined();
  });

  it('treats ALREADY_EXISTS (gRPC code 6) as idempotent success', async () => {
    setProdEnv();
    const err = Object.assign(new Error('already exists'), { code: 6 });
    createTaskMock.mockRejectedValue(err);

    const { enqueueAuditTask } = await import('./enqueue');
    const result = await enqueueAuditTask(PAYLOAD);

    expect(result.taskName).toContain('audit-run-1');
    // Dedupe is still a Cloud Tasks delivery — surface that to the caller.
    expect(result.mode).toBe('cloud-tasks');
  });

  it('rethrows non-ALREADY_EXISTS errors', async () => {
    setProdEnv();
    createTaskMock.mockRejectedValue(
      Object.assign(new Error('permission denied'), { code: 7 }),
    );

    const { enqueueAuditTask } = await import('./enqueue');
    await expect(enqueueAuditTask(PAYLOAD)).rejects.toThrow('permission denied');
  });

  it('respects the queuePath override option', async () => {
    setProdEnv();
    createTaskMock.mockResolvedValue([{ name: 'task-x' }]);

    const overrideParts = ['projects', 'p2', 'locations', 'l2', 'queues', 'q2'];
    const overridePath = overrideParts.join('/');
    const { enqueueAuditTask } = await import('./enqueue');
    await enqueueAuditTask(PAYLOAD, { queuePath: overridePath });

    expect(createTaskMock.mock.calls[0][0].parent).toBe(overridePath);
  });
});

// Caller-contract test: when enqueue throws, the caller (createAuditRun) must
// flip the AuditRun doc to FAILED before re-raising. We don't import the real
// helper here (it pulls in firebase-admin) — instead we model the documented
// wrapper inline and assert the behaviour stays in lockstep with the helper
// surface. Treat this as a regression guard for the production-consistency
// contract documented in create-audit-run.ts.
describe('enqueueAuditTask — caller failure-path contract', () => {
  async function callerWrapper(
    enqueue: () => Promise<unknown>,
    markFailed: (msg: string) => Promise<void>,
  ): Promise<void> {
    try {
      await enqueue();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markFailed(`Enqueue failed: ${message}`);
      throw err;
    }
  }

  it('marks the audit run FAILED and re-throws when dev-direct fetch rejects', async () => {
    process.env.AUDIT_WORKER_URL = 'http://localhost:8080';
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const markFailed = vi.fn().mockResolvedValue(undefined);
    const { enqueueAuditTask } = await import('./enqueue');

    await expect(
      callerWrapper(() => enqueueAuditTask(PAYLOAD), markFailed),
    ).rejects.toThrow(/ECONNREFUSED/);

    expect(markFailed).toHaveBeenCalledOnce();
    expect(markFailed.mock.calls[0][0]).toMatch(/Enqueue failed:.*ECONNREFUSED/);
  });

  it('does NOT mark the audit run FAILED on successful enqueue', async () => {
    process.env.AUDIT_WORKER_URL = 'http://localhost:8080';
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    const markFailed = vi.fn().mockResolvedValue(undefined);
    const { enqueueAuditTask } = await import('./enqueue');

    await callerWrapper(() => enqueueAuditTask(PAYLOAD), markFailed);

    expect(markFailed).not.toHaveBeenCalled();
  });
});
