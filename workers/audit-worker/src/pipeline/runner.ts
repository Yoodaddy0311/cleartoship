// Pipeline orchestrator — walks the 15-step STEP_REGISTRY for a single run.
// On error: marks AuditRun as FAILED with the offending step name; otherwise
// marks COMPLETED on the final step.
//
// Authorization note: every field that drives access decisions (ownerId,
// projectId, repoUrl, deployUrl, prdText) is sourced from the Firestore
// AuditRun document — NEVER from the Cloud Tasks payload. The queue is
// trusted only for the runId; an attacker who could mint a task payload
// with a forged ownerId would otherwise impersonate another user. The
// payload's runId is the index into Firestore, and Firestore rules already
// guaranteed at create-time that ownerId equals the authenticated uid.

import { AUDIT_STEPS, type AuditTaskPayload } from '@cleartoship/shared-types';
import type { WorkerCtx } from '../adapters/index.js';
import { STEP_REGISTRY, createInitialState } from './steps/index.js';
import {
  markRunStarted,
  markRunCompleted,
  markRunFailed,
  updateRunStep,
} from '../firestore/writers.js';
import { getAuditRunOrThrow } from '../firestore/readers.js';

export async function runPipeline(payload: AuditTaskPayload): Promise<void> {
  // Trust ONLY the runId from the payload. Re-fetch the source-of-truth
  // AuditRun from Firestore so ownerId / repoUrl / deployUrl / prdText are
  // the values the authenticated client actually wrote.
  let run;
  try {
    run = await getAuditRunOrThrow(payload.runId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      JSON.stringify({
        level: 'error',
        component: 'worker.runner',
        message: 'Refusing to run — AuditRun not loadable from Firestore',
        runId: payload.runId,
        error: message,
      }) + '\n',
    );
    // Best-effort status update; ignore if the doc truly doesn't exist.
    try {
      await markRunFailed(payload.runId, `Failed to load AuditRun: ${message}`);
    } catch {
      /* swallow */
    }
    return;
  }

  const ctx: WorkerCtx = {
    runId: run.id,
    projectId: run.projectId,
    ownerId: run.ownerId,
    repoUrl: run.repoUrl,
    deployUrl: run.deployUrl,
    prdText: run.prdText,
    clonePath: null,
    log: (level, message, meta) => {
      process.stderr.write(
        JSON.stringify({
          level,
          runId: run.id,
          component: 'worker',
          message,
          ...(meta ? { meta } : {}),
          ts: new Date().toISOString(),
        }) + '\n',
      );
    },
  };

  await markRunStarted(run.id);

  const state = createInitialState();
  const total = STEP_REGISTRY.length;

  for (let i = 0; i < STEP_REGISTRY.length; i++) {
    const step = STEP_REGISTRY[i]!;
    const percent = Math.round(((i + 1) / total) * 100);
    try {
      await updateRunStep(run.id, step.step, percent);
      ctx.log('info', `Step start: ${step.step}`, { index: i + 1, total });
      await step.execute(ctx, state);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.log('error', `Step failed: ${step.step}`, { error: message });
      await markRunFailed(run.id, `[${step.step}] ${message}`);
      return;
    }
  }

  // Safety: the registry should always run all AUDIT_STEPS in order.
  if (STEP_REGISTRY.length !== AUDIT_STEPS.length) {
    ctx.log('warn', 'Step registry / AUDIT_STEPS length mismatch', {
      registry: STEP_REGISTRY.length,
      declared: AUDIT_STEPS.length,
    });
  }

  await markRunCompleted(run.id);
}
