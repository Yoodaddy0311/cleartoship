// Tests for the Functions Cloud Tasks helper.
//
// Critical path: deterministic task name + ALREADY_EXISTS (gRPC code 6)
// dedupe — without this, racing the POST handler against the Firestore
// trigger would cause double-enqueue (and double audit execution).

import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  beforeEach(() => {
    __resetClientForTests(null);
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

  it('re-throws any non-ALREADY_EXISTS error', async () => {
    const otherErr = Object.assign(new Error('Internal'), { code: 13 });
    const mockClient = makeMockClient(async () => {
      throw otherErr;
    });
    __resetClientForTests(mockClient as unknown as Parameters<typeof __resetClientForTests>[0]);

    await expect(enqueueAuditTask(PAYLOAD, CONFIG)).rejects.toThrow('Internal');
  });
});
