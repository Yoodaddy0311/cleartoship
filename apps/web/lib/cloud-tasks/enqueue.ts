// Cloud Tasks enqueue helper.
// Sprint 0: prints to stdout when Cloud Tasks isn't configured so the Functions
// trigger and POST handler still complete end-to-end. Sprint 1+ swaps to the
// real @google-cloud/tasks v2 client.

import type { AuditTaskPayload } from '@cleartoship/shared-types';

export interface EnqueueOptions {
  /** Override env-derived queue path (testing). */
  queuePath?: string;
}

export interface EnqueueResult {
  taskName: string;
  enqueuedAt: string;
}

export async function enqueueAuditTask(
  payload: AuditTaskPayload,
  options: EnqueueOptions = {},
): Promise<EnqueueResult> {
  const project = process.env.CLOUD_TASKS_PROJECT;
  const location = process.env.CLOUD_TASKS_LOCATION;
  const queue = process.env.CLOUD_TASKS_QUEUE;
  const workerUrl = process.env.AUDIT_WORKER_URL;
  const queuePath =
    options.queuePath ??
    (project && location && queue
      ? `projects/${project}/locations/${location}/queues/${queue}`
      : null);

  // Sprint 0 fallback: no Cloud Tasks creds → structured stderr + synthetic id.
  if (!queuePath || !workerUrl) {
    const stubId = `stub-task-${payload.runId}-${Date.now()}`;
    process.stderr.write(
      JSON.stringify({
        level: 'warn',
        component: 'cloud-tasks',
        message: 'Sprint 0 stub enqueue — Cloud Tasks env not configured',
        runId: payload.runId,
        hint: 'Set CLOUD_TASKS_PROJECT, CLOUD_TASKS_LOCATION, CLOUD_TASKS_QUEUE, AUDIT_WORKER_URL to use the real queue.',
      }) + '\n',
    );
    return { taskName: stubId, enqueuedAt: new Date().toISOString() };
  }

  // Lazy-import the SDK so the web bundle doesn't pull it during build.
  const { CloudTasksClient } = await import('@google-cloud/tasks');
  const client = new CloudTasksClient();
  const invokerSa = process.env.AUDIT_WORKER_INVOKER_SA ?? '';

  // Deterministic task name → Cloud Tasks dedupes by name within the queue.
  // If both the POST handler and the Firestore onCreate trigger attempt to
  // enqueue for the same runId, the second call returns ALREADY_EXISTS, which
  // we swallow as a no-op (idempotent enqueue).
  const deterministicTaskName = `${queuePath}/tasks/audit-${payload.runId}`;

  try {
    const [task] = await client.createTask({
      parent: queuePath,
      task: {
        name: deterministicTaskName,
        httpRequest: {
          httpMethod: 'POST',
          url: `${workerUrl.replace(/\/+$/, '')}/run`,
          headers: { 'Content-Type': 'application/json' },
          body: Buffer.from(JSON.stringify(payload)).toString('base64'),
          ...(invokerSa
            ? { oidcToken: { serviceAccountEmail: invokerSa, audience: workerUrl } }
            : {}),
        },
        dispatchDeadline: { seconds: 600 },
      },
    });

    return {
      taskName: task.name ?? deterministicTaskName,
      enqueuedAt: new Date().toISOString(),
    };
  } catch (err) {
    // gRPC code 6 = ALREADY_EXISTS — another enqueuer (trigger or handler) won
    // the race. This is the intended dedupe behaviour, so report success.
    const code = (err as { code?: number } | null)?.code;
    if (code === 6) {
      process.stderr.write(
        JSON.stringify({
          level: 'info',
          component: 'cloud-tasks',
          message: 'Task already enqueued — dedupe via deterministic name',
          runId: payload.runId,
          taskName: deterministicTaskName,
        }) + '\n',
      );
      return { taskName: deterministicTaskName, enqueuedAt: new Date().toISOString() };
    }
    throw err;
  }
}
