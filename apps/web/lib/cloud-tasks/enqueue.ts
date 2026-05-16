// Cloud Tasks enqueue helper.
// Sprint 0: prints to stdout when Cloud Tasks isn't configured so the Functions
// trigger and POST handler still complete end-to-end. Sprint 1+ swaps to the
// real @google-cloud/tasks v2 client.

import type { AuditTaskPayload, EnqueueMode } from '@cleartoship/shared-types';

export type { EnqueueMode };

export interface EnqueueOptions {
  /** Override env-derived queue path (testing). */
  queuePath?: string;
}

export interface EnqueueResult {
  taskName: string;
  enqueuedAt: string;
  mode: EnqueueMode;
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

  // Dev fallback: Cloud Tasks unconfigured. If AUDIT_WORKER_URL is set and we're
  // not in production, POST directly to the worker so the local pipeline runs
  // end-to-end. Otherwise emit the legacy stub log so the request still resolves.
  //
  // Activation conditions (any true):
  //   - NEXT_PUBLIC_USE_EMULATORS === '1'
  //   - NODE_ENV !== 'production'
  // AND workerUrl is set. Cloud Tasks queue path may still be missing in dev.
  const isDevDirectMode =
    !queuePath &&
    !!workerUrl &&
    (process.env.NEXT_PUBLIC_USE_EMULATORS === '1' ||
      process.env.NODE_ENV !== 'production');

  if (isDevDirectMode) {
    const devTaskId = `dev-direct-${payload.runId}-${Date.now()}`;
    // Production-parity: AWAIT the POST so dispatch failures surface to the
    // caller. Previously fire-and-forget, but that left audit runs stuck in
    // PENDING when the worker was unreachable. Mirrors the functions-side
    // helper (`functions/src/lib/enqueue-audit-task.ts`) and lets the route
    // handler mark the run as FAILED on enqueue error.
    let response: Response;
    try {
      response = await fetch(`${workerUrl!.replace(/\/+$/, '')}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Dev-Mode': '1',
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        JSON.stringify({
          level: 'error',
          component: 'cloud-tasks',
          message: 'Dev direct POST to worker failed (network)',
          runId: payload.runId,
          workerUrl,
          error: message,
        }) + '\n',
      );
      throw new Error(
        `Dev-direct enqueue failed: worker fetch rejected (${message})`,
      );
    }

    if (!response.ok) {
      process.stderr.write(
        JSON.stringify({
          level: 'error',
          component: 'cloud-tasks',
          message: 'Dev direct POST to worker returned non-2xx',
          runId: payload.runId,
          workerUrl,
          status: response.status,
        }) + '\n',
      );
      throw new Error(
        `Dev-direct enqueue failed: worker responded ${response.status}`,
      );
    }

    process.stderr.write(
      JSON.stringify({
        level: 'info',
        component: 'cloud-tasks',
        message: 'Dev mode — bypassed Cloud Tasks, posted directly to worker',
        runId: payload.runId,
        workerUrl,
      }) + '\n',
    );
    return {
      taskName: devTaskId,
      enqueuedAt: new Date().toISOString(),
      mode: 'direct-worker',
    };
  }

  if (!queuePath || !workerUrl) {
    const stubId = `stub-task-${payload.runId}-${Date.now()}`;
    process.stderr.write(
      JSON.stringify({
        level: 'warn',
        component: 'cloud-tasks',
        message: 'Sprint 0 stub enqueue — Cloud Tasks env not configured',
        runId: payload.runId,
        hint: 'Set CLOUD_TASKS_PROJECT, CLOUD_TASKS_LOCATION, CLOUD_TASKS_QUEUE, AUDIT_WORKER_URL to use the real queue. For local dev, set AUDIT_WORKER_URL=http://localhost:8080 + ALLOW_DEV_BYPASS=1 on the worker.',
      }) + '\n',
    );
    return { taskName: stubId, enqueuedAt: new Date().toISOString(), mode: 'stub' };
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
      mode: 'cloud-tasks',
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
      return {
        taskName: deterministicTaskName,
        enqueuedAt: new Date().toISOString(),
        mode: 'cloud-tasks',
      };
    }
    throw err;
  }
}
