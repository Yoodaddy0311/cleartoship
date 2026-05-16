// Tests for the Functions Cloud Tasks helper.
//
// Critical path: deterministic task name + ALREADY_EXISTS (gRPC code 6)
// dedupe — without this, racing the POST handler against the Firestore
// trigger would cause double-enqueue (and double audit execution).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  enqueueAuditTask,
  __resetClientForTests,
  type EnqueueAuditTaskConfig,
} from '../lib/enqueue-audit-task.js';
import type { AuditTaskPayload } from '@cleartoship/shared-types';

const CONFIG: EnqueueAuditTaskConfig = {
  project: 'demo',
  location: 'asia-northeast3',
  queue: 'audit-jobs',
  workerUrl: 'https://worker.example.com',
};

const PAYLOAD: AuditTaskPayload = {
  runId: 'run-123',
  projectId: 'proj-1',
  ownerId: 'owner-1',
  repoUrl: 'https://github.com/example/repo',
  deployUrl: null,
  prdText: null,
  commitHash: null,
};

const EXPECTED_QUEUE_PATH = 'projects/demo/locations/asia-northeast3/queues/audit-jobs';
const EXPECTED_TASK_NAME = `${EXPECTED_QUEUE_PATH}/tasks/audit-run-123`;

function makeMockClient(createTaskImpl: (req: unknown) => Promise<unknown>) {
  return {
    queuePath: (p: string, l: string, q: string) =>
      `projects/${p}/locations/${l}/queues/${q}`,
    createTask: vi.fn(createTaskImpl),
  };
}

describe('enqueueAuditTask', () => {
  // Spy on stdout to capture structured metric events without printing them
  // during the suite. process.stdout.write's overloaded signature trips
  // vitest's Mock generics, so we type as any.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;

  beforeEach(() => {
    __resetClientForTests(null);
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it('returns the task name and deduped=false on a fresh create', async () => {
    const mockClient = makeMockClient(async () => [{ name: EXPECTED_TASK_NAME }]);
    __resetClientForTests(mockClient as unknown as Parameters<typeof __resetClientForTests>[0]);

    const result = await enqueueAuditTask(PAYLOAD, CONFIG);

    expect(result).toEqual({ taskName: EXPECTED_TASK_NAME, deduped: false });
    expect(mockClient.createTask).toHaveBeenCalledTimes(1);

    const call = mockClient.createTask.mock.calls[0]?.[0] as {
      parent: string;
      task: { name: string; httpRequest: { url: string; body: string } };
    };
    expect(call.parent).toBe(EXPECTED_QUEUE_PATH);
    expect(call.task.name).toBe(EXPECTED_TASK_NAME);
    expect(call.task.httpRequest.url).toBe('https://worker.example.com/run');
  });

  it('emits audit_task.enqueue.created structured metric on a fresh create', async () => {
    const mockClient = makeMockClient(async () => [{ name: EXPECTED_TASK_NAME }]);
    __resetClientForTests(mockClient as unknown as Parameters<typeof __resetClientForTests>[0]);

    await enqueueAuditTask(PAYLOAD, CONFIG);

    // Exactly one structured metric line emitted to stdout.
    const lines = stdoutSpy.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .filter((l: string) => l.includes('audit_task.enqueue'));
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!.trim());
    expect(parsed.event).toBe('audit_task.enqueue.created');
    expect(parsed.runId).toBe('run-123');
    expect(parsed.taskName).toBe(EXPECTED_TASK_NAME);
    expect(typeof parsed.timestamp).toBe('string');
    // ISO 8601 sanity check
    expect(parsed.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T/);
    // Metric must be a single line (Cloud Logging parses one JSON per line).
    expect(lines[0]!.endsWith('\n')).toBe(true);
    expect(lines[0]!.slice(0, -1)).not.toContain('\n');
  });

  it('swallows ALREADY_EXISTS (gRPC code 6) and returns deduped=true', async () => {
    const dupErr = Object.assign(new Error('Task name already exists'), { code: 6 });
    const mockClient = makeMockClient(async () => {
      throw dupErr;
    });
    __resetClientForTests(mockClient as unknown as Parameters<typeof __resetClientForTests>[0]);

    const result = await enqueueAuditTask(PAYLOAD, CONFIG);

    expect(result).toEqual({ taskName: EXPECTED_TASK_NAME, deduped: true });
    expect(mockClient.createTask).toHaveBeenCalledTimes(1);
  });

  it('emits audit_task.enqueue.deduped structured metric on ALREADY_EXISTS', async () => {
    const dupErr = Object.assign(new Error('Task name already exists'), { code: 6 });
    const mockClient = makeMockClient(async () => {
      throw dupErr;
    });
    __resetClientForTests(mockClient as unknown as Parameters<typeof __resetClientForTests>[0]);

    await enqueueAuditTask(PAYLOAD, CONFIG);

    const lines = stdoutSpy.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .filter((l: string) => l.includes('audit_task.enqueue'));
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!.trim());
    expect(parsed.event).toBe('audit_task.enqueue.deduped');
    expect(parsed.runId).toBe('run-123');
    expect(parsed.taskName).toBe(EXPECTED_TASK_NAME);
    expect(typeof parsed.timestamp).toBe('string');
  });

  it('re-throws any non-ALREADY_EXISTS error', async () => {
    const otherErr = Object.assign(new Error('Internal'), { code: 13 });
    const mockClient = makeMockClient(async () => {
      throw otherErr;
    });
    __resetClientForTests(mockClient as unknown as Parameters<typeof __resetClientForTests>[0]);

    await expect(enqueueAuditTask(PAYLOAD, CONFIG)).rejects.toThrow('Internal');
  });

  it('does NOT emit any metric event when a non-ALREADY_EXISTS error is thrown', async () => {
    const otherErr = Object.assign(new Error('Internal'), { code: 13 });
    const mockClient = makeMockClient(async () => {
      throw otherErr;
    });
    __resetClientForTests(mockClient as unknown as Parameters<typeof __resetClientForTests>[0]);

    await expect(enqueueAuditTask(PAYLOAD, CONFIG)).rejects.toThrow('Internal');
    const lines = stdoutSpy.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .filter((l: string) => l.includes('audit_task.enqueue'));
    expect(lines).toHaveLength(0);
  });
});
