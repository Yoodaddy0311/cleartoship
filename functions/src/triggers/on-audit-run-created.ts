// Firestore onCreate trigger for /auditRuns/{runId}.
//
// Responsibilities:
//   1. Validate the new doc has minimum fields (ownerId, projectId, repoUrl).
//   2. Enqueue a Cloud Task on `audit-jobs` via the shared helper.
//   3. Persist `enqueueMode` back onto the AuditRun doc so the read side can
//      tell which dispatch route handled the run. Mirrors the enqueue-then-
//      update pattern in `apps/web/lib/audit-runs/create-audit-run.ts` so both
//      creation paths leave the same persisted shape.
//   4. Leave AuditRun.status === 'PENDING' — the worker flips to RUNNING.
//
// Re-fire safety: this is `onDocumentCreated`, so the post-enqueue update does
// NOT re-trigger the handler. Idempotency: if the direct API path already
// wrote `enqueueMode` before the trigger fires (eventually consistent), we
// skip the enqueue+update so we don't double-dispatch and don't overwrite an
// already-correct route label.
//
// Deterministic task name + ALREADY_EXISTS dedupe lives in
// `../lib/enqueue-audit-task.ts` so both this trigger and the POST handler
// share one implementation.

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import type { AuditTaskPayload, EnqueueMode } from '@cleartoship/shared-types';
import { enqueueAuditTask } from '../lib/enqueue-audit-task.js';

const REGION = process.env.CLOUD_TASKS_LOCATION ?? 'asia-northeast3';
const QUEUE = process.env.CLOUD_TASKS_QUEUE ?? 'audit-jobs';
const PROJECT = process.env.CLOUD_TASKS_PROJECT ?? process.env.GCP_PROJECT ?? '';
const WORKER_URL = process.env.AUDIT_WORKER_URL ?? '';
const INVOKER_SA = process.env.AUDIT_WORKER_INVOKER_SA ?? '';

export const onAuditRunCreated = onDocumentCreated(
  {
    document: 'auditRuns/{runId}',
    region: REGION,
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (event) => {
    const runId = event.params.runId;
    const snapshot = event.data;
    const data = snapshot?.data() as Record<string, unknown> | undefined;
    if (!snapshot || !data) {
      log('warn', 'onAuditRunCreated received empty snapshot/data', { runId });
      return;
    }

    // Idempotency guard: if a parallel writer (the direct API path) already
    // populated `enqueueMode`, the enqueue has already happened or is in
    // flight via that path. Skip to avoid double-dispatch and to avoid
    // clobbering an already-correct route label. We treat any non-null value
    // as "owned by another writer" — null/undefined means "not yet set".
    if (data.enqueueMode != null) {
      log('info', 'enqueueMode already set — skipping trigger enqueue', {
        runId,
        existing: String(data.enqueueMode),
      });
      return;
    }

    const payload = buildPayload(runId, data);
    if (!payload) {
      log('error', 'AuditRun missing required fields — skipping enqueue', { runId });
      return;
    }

    // Under the Firebase emulator we only need AUDIT_WORKER_URL — the helper
    // short-circuits Cloud Tasks and POSTs directly to the worker. Outside the
    // emulator (prod/staging) we still require CLOUD_TASKS_PROJECT. NODE_ENV
    // is intentionally NOT consulted here — see lib/enqueue-audit-task.ts for
    // the rationale.
    const isDev = process.env.FUNCTIONS_EMULATOR === 'true';
    if (!WORKER_URL || (!isDev && !PROJECT)) {
      log('warn', 'AUDIT_WORKER_URL or CLOUD_TASKS_PROJECT unset — recording stub', {
        runId,
        isDev,
        hasWorkerUrl: !!WORKER_URL,
        hasProject: !!PROJECT,
      });
      // Record `stub` so the read side can tell this run never reached a real
      // dispatcher. Mirrors the `stub` branch of the web-side enqueue helper.
      await persistEnqueueMode(snapshot.ref, 'stub', runId);
      return;
    }

    try {
      const result = await enqueueAuditTask(payload, {
        project: PROJECT,
        location: REGION,
        queue: QUEUE,
        workerUrl: WORKER_URL,
        invokerSa: INVOKER_SA || undefined,
      });
      // Infer dispatch route from the path the helper took. The helper itself
      // does not return `mode` (it was designed before this field existed);
      // the env-check above plus `isDev` fully determines which branch ran.
      const mode: EnqueueMode = isDev ? 'direct-worker' : 'cloud-tasks';
      await persistEnqueueMode(snapshot.ref, mode, runId);
      log(
        'info',
        result.deduped
          ? 'Audit task already enqueued — dedupe via deterministic name'
          : 'Enqueued audit task',
        { runId, taskName: result.taskName, deduped: result.deduped, mode },
      );
    } catch (err) {
      log('error', 'Failed to enqueue audit task', {
        runId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err; // surface to Functions retry policy.
    }
  },
);

function buildPayload(
  runId: string,
  data: Record<string, unknown>,
): AuditTaskPayload | null {
  const ownerId = typeof data.ownerId === 'string' ? data.ownerId : null;
  const projectId = typeof data.projectId === 'string' ? data.projectId : null;
  const repoUrl = typeof data.repoUrl === 'string' ? data.repoUrl : null;
  if (!ownerId || !projectId || !repoUrl) return null;
  return {
    runId,
    projectId,
    ownerId,
    repoUrl,
    deployUrl: typeof data.deployUrl === 'string' ? data.deployUrl : null,
    prdText: typeof data.prdText === 'string' ? data.prdText : null,
    commitHash: null,
  };
}

/**
 * Best-effort post-enqueue update. We do NOT re-throw on failure because the
 * enqueue itself already happened; losing the mode label is observability
 * noise, not a correctness hazard. The Functions runtime would otherwise
 * retry the whole handler and risk creating a duplicate task (the
 * deterministic name protects against this, but we still avoid the round
 * trip).
 */
async function persistEnqueueMode(
  // FirebaseFirestore.DocumentReference is the runtime type of snapshot.ref.
  // We accept `unknown`-ish here to keep the function vitest-mockable without
  // dragging in the full admin types in tests.
  ref: { update: (data: Record<string, unknown>) => Promise<unknown> },
  mode: EnqueueMode,
  runId: string,
): Promise<void> {
  try {
    await ref.update({
      enqueueMode: mode,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    log('warn', 'Failed to persist enqueueMode on AuditRun doc', {
      runId,
      mode,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
  process.stderr.write(
    JSON.stringify({
      level,
      component: 'functions.onAuditRunCreated',
      message,
      ...(meta ? { meta } : {}),
      ts: new Date().toISOString(),
    }) + '\n',
  );
}
