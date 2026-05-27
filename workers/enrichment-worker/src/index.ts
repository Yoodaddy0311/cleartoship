// Cloud Run job entry for the opt-in audit enrichment (Audit Quality Roadmap §6).
//
// Triggered per AuditRun (RUN_ID env / argv[2]). Re-reads the run + report from
// Firestore, runs the L-bucket enrichment via the Anthropic provider, and merges
// the result onto the report doc. A skip (missing run, aiEnhanced off, cache hit)
// is SUCCESS — `exit(0)` — so the job does not retry. Only unexpected failures
// and a missing API key exit non-zero. Env is injected by Cloud Run (no dotenv).

import {
  type AuditEnrichment,
  type AuditRun,
} from '@cleartoship/shared-types';
import { AnthropicProvider } from './anthropic-provider.js';
import {
  fetchReport,
  fetchRun,
  getFirestoreClient,
  writeEnrichment,
} from './firestore.js';
import { runEnrichment } from './orchestrator.js';
import { loadSkillBody } from './skill-loader.js';

const COMPONENT = 'enrichment.job';

type LogLevel = 'info' | 'warn' | 'error';

/** Structured single-line JSON to stderr — mirrors audit-worker logging. */
function log(level: LogLevel, message: string, extra: Record<string, unknown> = {}): void {
  process.stderr.write(
    JSON.stringify({ level, component: COMPONENT, message, ...extra, ts: new Date().toISOString() }) +
      '\n',
  );
}

function resolveRunId(): string | null {
  const fromEnv = process.env.RUN_ID;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  const fromArgv = process.argv[2];
  return fromArgv && fromArgv.length > 0 ? fromArgv : null;
}

/** True when the report already holds a DONE enrichment for this exact commit. */
function isCacheHit(run: AuditRun, enrichment: AuditEnrichment | undefined): boolean {
  return enrichment?.status === 'DONE' && enrichment.commitSha === run.commitHash;
}

async function main(): Promise<void> {
  const runId = resolveRunId();
  if (!runId) {
    log('error', 'missing RUN_ID (env or argv[2])');
    process.exit(1);
  }

  const db = getFirestoreClient();
  const run = await fetchRun(db, runId);

  // Skip guards — each is SUCCESS (exit 0), not a failure to retry.
  if (!run) {
    log('info', 'skip: run not found', { runId });
    process.exit(0);
  }
  if (run.aiEnhanced !== true) {
    log('info', 'skip: run is not aiEnhanced', { runId });
    process.exit(0);
  }
  const report = await fetchReport(db, runId);
  if (!report) {
    log('info', 'skip: report not found', { runId });
    process.exit(0);
  }
  if (isCacheHit(run, report.enrichment)) {
    log('info', 'skip: enrichment cache hit', { runId, commitSha: run.commitHash });
    process.exit(0);
  }

  // Optimistic PENDING so the dashboard can show progress while we run.
  await writeEnrichment(db, runId, {
    status: 'PENDING',
    commitSha: run.commitHash,
    categories: [],
  });

  const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
  if (apiKey.length === 0) {
    log('error', 'ANTHROPIC_API_KEY is not set', { runId });
    await writeEnrichment(db, runId, {
      status: 'ERROR',
      commitSha: run.commitHash,
      categories: [],
    });
    process.exit(1);
  }

  const provider = new AnthropicProvider({ apiKey });
  const enrichment = await runEnrichment({ run, report, provider, loadSkill: loadSkillBody });
  await writeEnrichment(db, runId, enrichment);

  log('info', 'enrichment complete', {
    runId,
    status: enrichment.status,
    categories: enrichment.categories.length,
    totalTokens: enrichment.totalTokens ?? 0,
  });
  process.exit(0);
}

main().catch(async (err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  log('error', 'enrichment job failed', { error: message });
  // Best-effort ERROR stamp so the dashboard doesn't hang on PENDING.
  try {
    const runId = resolveRunId();
    if (runId) {
      const db = getFirestoreClient();
      const run = await fetchRun(db, runId);
      await writeEnrichment(db, runId, {
        status: 'ERROR',
        commitSha: run?.commitHash ?? null,
        categories: [],
      });
    }
  } catch (writeErr) {
    log('warn', 'failed to write ERROR enrichment', {
      error: writeErr instanceof Error ? writeErr.message : String(writeErr),
    });
  }
  process.exit(1);
});
