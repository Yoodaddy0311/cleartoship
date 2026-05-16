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

/**
 * Emulator fallback: POST directly to the worker over HTTP, bypassing Cloud
 * Tasks. Activated when FUNCTIONS_EMULATOR === 'true'. Awaited so dispatch
 * errors surface in the Functions logs, but a failed POST is downgraded to a
 * warn log rather than re-thrown so the emulator trigger does not retry.
 */
async function postDirectlyToWorker(
  payload: AuditTaskPayload,
  workerUrl: string,
): Promise<EnqueueAuditTaskResult> {
  const devTaskName = `dev-direct-${payload.runId}-${Date.now()}`;
  try {
    await fetch(`${workerUrl.replace(/\/+$/, '')}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Dev-Mode': '1' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    process.stderr.write(
      JSON.stringify({
        level: 'warn',
        component: 'functions.enqueue-audit-task',
        message: 'Dev direct POST to worker failed (fire-and-forget)',
        runId: payload.runId,
        workerUrl,
        error: err instanceof Error ? err.message : String(err),
      }) + '\n',
    );
  }
  return { taskName: devTaskName, deduped: false };
}

// Activate the direct-POST fallback only when running under the Firebase
// emulator. We intentionally do NOT key off NODE_ENV here because vitest sets
// NODE_ENV='test', which would silently divert real Cloud Tasks creates during
// the test suite. Production-shaped tests therefore use the real path; opt-in
// emulator runs use the bypass.
function isEmulatorOrDev(): boolean {
  return process.env.FUNCTIONS_EMULATOR === 'true';
}

export async function enqueueAuditTask(
  payload: AuditTaskPayload,
  config: EnqueueAuditTaskConfig,
): Promise<EnqueueAuditTaskResult> {
  const { project, location, queue, workerUrl, invokerSa } = config;

  // Dev/emulator path — skip Cloud Tasks entirely, POST directly. Keeps the
  // local Firestore-trigger → worker loop closed without any GCP creds.
  if (isEmulatorOrDev() && workerUrl) {
    return postDirectlyToWorker(payload, workerUrl);
  }

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
    const finalTaskName = task.name ?? deterministicTaskName;
    emitMetric('audit_task.enqueue.created', payload.runId, finalTaskName);
    return { taskName: finalTaskName, deduped: false };
  } catch (err) {
    // gRPC code 6 = ALREADY_EXISTS — dedupe path, intended behaviour.
    const code = (err as { code?: number } | null)?.code;
    if (code === 6) {
      emitMetric('audit_task.enqueue.deduped', payload.runId, deterministicTaskName);
      return { taskName: deterministicTaskName, deduped: true };
    }
    throw err;
  }
}

/**
 * Emit a single-line structured JSON metric event to stdout. Cloud Logging
 * auto-parses JSON-formatted stdout lines from Cloud Functions, so these
 * events become first-class log entries that can be filtered/aggregated
 * without extra agents. Format intentionally matches the contract documented
 * in Sprint 3 P1-C: { event, runId, taskName, timestamp }.
 */
function emitMetric(
  event: 'audit_task.enqueue.created' | 'audit_task.enqueue.deduped',
  runId: string,
  taskName: string,
): void {
  process.stdout.write(
    JSON.stringify({
      event,
      runId,
      taskName,
      timestamp: new Date().toISOString(),
    }) + '\n',
  );
}
