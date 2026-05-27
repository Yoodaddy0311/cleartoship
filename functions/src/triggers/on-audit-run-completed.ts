// Firestore onUpdate trigger for /auditRuns/{runId}.
//
// Responsibility: when an AuditRun finishes (status → COMPLETED) AND the run
// opted into AI enrichment (aiEnhanced === true), fire the `enrichment-worker`
// Cloud Run JOB with RUN_ID overridden to this run. The job loads the audit
// report from Firestore, runs the opt-in LLM enrichment, and writes
// `report.enrichment` back.
//
// Fire conditions (all three must hold, comparing before → after):
//   1. after.status === 'COMPLETED'
//   2. after.aiEnhanced === true
//   3. before.status !== 'COMPLETED'  (the status TRANSITIONED on this write)
// The third guard is what keeps later metadata updates (e.g. the job writing
// `report.enrichment` back, or `enqueueMode` edits) from re-firing the job.
// The job itself also cache-guards on report.enrichment, so this is defence in
// depth against redundant — and cost-incurring — executions.
//
// Execution: @google-cloud/run JobsClient.runJob with a RUN_ID containerOverride.
// Job resource name: projects/{PROJECT}/locations/{REGION}/jobs/{ENRICHMENT_JOB_NAME}.
//
// Guard: if PROJECT/REGION are unset (e.g. the Firebase emulator) we log a stub
// and return without dispatching — mirrors the `stub` branch in
// on-audit-run-created.ts. A real dispatch failure is logged and re-thrown so
// the Functions retry policy can take over.

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { JobsClient } from '@google-cloud/run';

const REGION = process.env.CLOUD_TASKS_LOCATION ?? 'asia-northeast3';
// Reuse the existing project env names (same precedence as on-audit-run-created).
const PROJECT = process.env.CLOUD_TASKS_PROJECT ?? process.env.GCP_PROJECT ?? '';
const ENRICHMENT_JOB_NAME = process.env.ENRICHMENT_JOB_NAME ?? 'enrichment-worker';

// Lazily instantiated so unit tests can mock @google-cloud/run before the
// client is constructed, and so module import never touches GCP auth.
let jobsClient: JobsClient | null = null;
function getJobsClient(): JobsClient {
  if (!jobsClient) jobsClient = new JobsClient();
  return jobsClient;
}

export const onAuditRunCompleted = onDocumentUpdated(
  {
    document: 'auditRuns/{runId}',
    region: REGION,
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (event) => {
    const runId = event.params.runId;
    const before = event.data?.before?.data() as Record<string, unknown> | undefined;
    const after = event.data?.after?.data() as Record<string, unknown> | undefined;

    if (!after) {
      // Deletion or empty post-image — nothing to enrich.
      log('warn', 'onAuditRunCompleted received empty after-snapshot', { runId });
      return;
    }

    if (!shouldFire(before, after)) {
      // Common, expected case — not a transition-to-COMPLETED-with-aiEnhanced.
      // Logged at debug-ish info only when status is COMPLETED to keep noise low.
      return;
    }

    // Emulator / unconfigured environment: no project to address the job in.
    const isDev = process.env.FUNCTIONS_EMULATOR === 'true';
    if (!PROJECT) {
      log('warn', 'CLOUD_TASKS_PROJECT/GCP_PROJECT unset — skipping job dispatch (stub)', {
        runId,
        isDev,
      });
      return;
    }

    const jobName = `projects/${PROJECT}/locations/${REGION}/jobs/${ENRICHMENT_JOB_NAME}`;
    try {
      const client = getJobsClient();
      await client.runJob({
        name: jobName,
        overrides: {
          containerOverrides: [{ env: [{ name: 'RUN_ID', value: runId }] }],
        },
      });
      log('info', 'Dispatched enrichment-worker job', {
        runId,
        jobName,
      });
    } catch (err) {
      log('error', 'Failed to dispatch enrichment-worker job', {
        runId,
        jobName,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err; // surface to Functions retry policy.
    }
  },
);

/**
 * Decide whether this write is the COMPLETED + aiEnhanced transition that should
 * trigger enrichment. All three conditions must hold:
 *   - after.status === 'COMPLETED'
 *   - after.aiEnhanced === true
 *   - before.status !== 'COMPLETED'  (status actually transitioned on this write)
 * `before` may be undefined in unusual replay scenarios — treat that as "was not
 * COMPLETED" so a first-seen COMPLETED still fires.
 */
export function shouldFire(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
): boolean {
  if (after.status !== 'COMPLETED') return false;
  if (after.aiEnhanced !== true) return false;
  const beforeStatus = before?.status;
  if (beforeStatus === 'COMPLETED') return false; // no transition — already done.
  return true;
}

function log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
  process.stderr.write(
    JSON.stringify({
      level,
      component: 'functions.onAuditRunCompleted',
      message,
      ...(meta ? { meta } : {}),
      ts: new Date().toISOString(),
    }) + '\n',
  );
}
