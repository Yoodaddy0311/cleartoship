// Tests for the emulator-bypass branch of enqueueAuditTask.
//
// The Cloud Tasks happy-path + ALREADY_EXISTS dedupe path is covered by
// `functions/src/__tests__/enqueue-audit-task.test.ts`. This sibling file
// targets the previously-untested branch:
//   - isEmulatorOrDev() => true when FUNCTIONS_EMULATOR === 'true'
//   - postDirectlyToWorker() => HTTP POST to {workerUrl}/run with
//     Content-Type: application/json + X-Dev-Mode: 1 + serialized payload
//   - Failed fetch is swallowed (warn log via stderr), function still resolves
//
// We exercise these helpers through the public `enqueueAuditTask` entry point
// because the helpers are intentionally module-private. `FUNCTIONS_EMULATOR`
// is stubbed and restored in afterEach so subsequent tests are unaffected.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditTaskPayload } from '@cleartoship/shared-types';

const PAYLOAD: AuditTaskPayload = {
  runId: 'run-emu-1',
  projectId: 'proj-1',
  ownerId: 'owner-1',
  repoUrl: 'https://github.com/example/repo',
  deployUrl: null,
  prdText: null,
  commitHash: null,
};

const CONFIG = {
  project: 'demo',
  location: 'asia-northeast3',
  queue: 'audit-jobs',
  workerUrl: 'https://worker.example.com/',
};

describe('enqueueAuditTask — emulator bypass (postDirectlyToWorker)', () => {
  const originalEmu = process.env.FUNCTIONS_EMULATOR;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('FUNCTIONS_EMULATOR', 'true');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    if (originalEmu === undefined) {
      delete (process.env as Record<string, string | undefined>).FUNCTIONS_EMULATOR;
    } else {
      process.env.FUNCTIONS_EMULATOR = originalEmu;
    }
    vi.restoreAllMocks();
  });

  it('POSTs directly to {workerUrl}/run with JSON body and X-Dev-Mode header', async () => {
    const { enqueueAuditTask } = await import('./enqueue-audit-task.js');

    const result = await enqueueAuditTask(PAYLOAD, CONFIG);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://worker.example.com/run');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-Dev-Mode']).toBe('1');
    expect(typeof init.body).toBe('string');
    expect(JSON.parse(init.body as string)).toEqual(PAYLOAD);

    expect(result.deduped).toBe(false);
    expect(result.taskName).toMatch(/^dev-direct-run-emu-1-/);
  });

  it('strips trailing slashes from workerUrl before appending /run', async () => {
    const { enqueueAuditTask } = await import('./enqueue-audit-task.js');

    await enqueueAuditTask(PAYLOAD, { ...CONFIG, workerUrl: 'https://worker.example.com///' });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://worker.example.com/run');
  });

  it('swallows fetch errors (fire-and-forget) and still returns a result', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connection refused'));
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const { enqueueAuditTask } = await import('./enqueue-audit-task.js');

    const result = await enqueueAuditTask(PAYLOAD, CONFIG);

    expect(result.deduped).toBe(false);
    expect(result.taskName).toMatch(/^dev-direct-run-emu-1-/);
    expect(stderrSpy).toHaveBeenCalled();
    const logged = String(stderrSpy.mock.calls[0]?.[0] ?? '');
    expect(logged).toContain('Dev direct POST to worker failed');
    stderrSpy.mockRestore();
  });
});

describe('enqueueAuditTask — isEmulatorOrDev gate', () => {
  const originalEmu = process.env.FUNCTIONS_EMULATOR;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    if (originalEmu === undefined) {
      delete (process.env as Record<string, string | undefined>).FUNCTIONS_EMULATOR;
    } else {
      process.env.FUNCTIONS_EMULATOR = originalEmu;
    }
  });

  it('does NOT take the direct-POST branch when FUNCTIONS_EMULATOR is unset', async () => {
    vi.stubEnv('FUNCTIONS_EMULATOR', '');
    const { enqueueAuditTask, __resetClientForTests } = await import(
      './enqueue-audit-task.js'
    );

    const createTask = vi.fn(async () => [
      { name: 'projects/demo/locations/asia-northeast3/queues/audit-jobs/tasks/audit-run-emu-1' },
    ]);
    __resetClientForTests({
      queuePath: (p: string, l: string, q: string) =>
        `projects/${p}/locations/${l}/queues/${q}`,
      createTask,
    } as unknown as Parameters<typeof __resetClientForTests>[0]);

    await enqueueAuditTask(PAYLOAD, CONFIG);

    expect(createTask).toHaveBeenCalledTimes(1);
    // fetch must NOT have been called because we didn't take the emu branch.
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);

    __resetClientForTests(null);
  });

  it('takes the direct-POST branch when FUNCTIONS_EMULATOR === "true"', async () => {
    vi.stubEnv('FUNCTIONS_EMULATOR', 'true');
    const { enqueueAuditTask } = await import('./enqueue-audit-task.js');

    await enqueueAuditTask(PAYLOAD, CONFIG);

    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });
});
