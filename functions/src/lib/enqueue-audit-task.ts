// Cloud Tasks enqueue helper for the Functions runtime.
//
// Mirrors the deterministic-name + ALREADY_EXISTS dedupe behaviour of
// `apps/web/lib/cloud-tasks/enqueue.ts` so both the POST handler and the
// Firestore onCreate trigger can race safely for the same runId. The trigger
// just imports `enqueueAuditTask` and stays under 30 lines.
//
// Differences from the web helper:
//   - Reuses a module-singleton CloudTasksClient (CloudTasksClient is safe to
//     share across invocations; Functions instances are warm-reusable).
//   - Returns `{ taskName, deduped }` so callers can distinguish a fresh
//     create from an idempotent no-op for log clarity.
//   - Does NOT include a Sprint-0 stub path — the trigger pre-checks env vars
//     and skips the call entirely in dev mode (keeps log lines stable).
//
// SECURITY:
//   - OIDC token attached only when AUDIT_WORKER_INVOKER_SA is set (prod).
//   - Payload is base64-encoded JSON; never logged in full.
//   - Caller MUST validate `payload.runId` is a safe document id before
//     calling — the runId is embedded in the Cloud Tasks resource name.
//
// FAILURE MODES:
//   - gRPC code 6 (ALREADY_EXISTS) → swallowed, returns deduped: true.
//   - Any other error → re-thrown so the Functions retry policy can act.

import { CloudTasksClient } from '@google-cloud/tasks';
import type { AuditTaskPayload } from '@cleartoship/shared-types';

export interface EnqueueAuditTaskConfig {
  project: string;
  location: string;
  queue: string;
  workerUrl: string;
  /** Optional service account email for OIDC auth to the worker. */
  invokerSa?: string;
}

export interface EnqueueAuditTaskResult {
  taskName: string;
  /** True when ALREADY_EXISTS was returned — another enqueuer won the race. */
  deduped: boolean;
}

// Module-singleton client — Functions instances are warm-reused, so creating
// the client once at cold start avoids per-invocation auth handshake cost.
let cachedClient: CloudTasksClient | null = null;

function getClient(): CloudTasksClient {
  if (!cachedClient) cachedClient = new CloudTasksClient();
  return cachedClient;
}

/** Test-only: reset the cached client (lets mocks replace the SDK). */
export function __resetClientForTests(client: CloudTasksClient | null): void {
  cachedClient = client;
}

export async function enqueueAuditTask(
  payload: AuditTaskPayload,
  config: EnqueueAuditTaskConfig,
): Promise<EnqueueAuditTaskResult> {
  const { project, location, queue, workerUrl, invokerSa } = config;
  const client = getClient();
  const queuePath = client.queuePath(project, location, queue);

  // Deterministic task name → Cloud Tasks dedupes by name within the queue.
  // If both the POST handler and this trigger attempt to enqueue for the same
  // runId, the second call returns ALREADY_EXISTS, which we swallow as a
  // no-op. This is the contract documented in apps/web/lib/cloud-tasks/enqueue.ts.
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
    return { taskName: task.name ?? deterministicTaskName, deduped: false };
  } catch (err) {
    // gRPC code 6 = ALREADY_EXISTS — dedupe path, intended behaviour.
    const code = (err as { code?: number } | null)?.code;
    if (code === 6) {
      return { taskName: deterministicTaskName, deduped: true };
    }
    throw err;
  }
}
