// Firestore onCreate trigger for /auditRuns/{runId}.
//
// Responsibilities:
//   1. Validate the new doc has minimum fields (ownerId, projectId, repoUrl).
//   2. Enqueue a Cloud Task on `audit-jobs` via the shared helper.
//   3. Leave AuditRun.status === 'PENDING' — the worker flips to RUNNING.
//
// Deterministic task name + ALREADY_EXISTS dedupe lives in
// `../lib/enqueue-audit-task.ts` so both this trigger and the POST handler
// share one implementation.

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import type { AuditTaskPayload } from '@cleartoship/shared-types';
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
    const data = event.data?.data() as Record<string, unknown> | undefined;
    if (!data) {
      log('warn', 'onAuditRunCreated received empty snapshot/data', { runId });
      return;
    }

    const payload = buildPayload(runId, data);
    if (!payload) {
      log('error', 'AuditRun missing required fields — skipping enqueue', { runId });
      return;
    }

    if (!PROJECT || !WORKER_URL) {
      log('warn', 'CLOUD_TASKS_PROJECT or AUDIT_WORKER_URL unset — skipping enqueue (dev mode)', {
        runId,
      });
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
      log(
        'info',
        result.deduped
          ? 'Audit task already enqueued — dedupe via deterministic name'
          : 'Enqueued audit task',
        { runId, taskName: result.taskName, deduped: result.deduped },
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
