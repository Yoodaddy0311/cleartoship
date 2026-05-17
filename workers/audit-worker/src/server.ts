// Cloud Run HTTP entrypoint — accepts Cloud Tasks payloads at POST /run.
//
// Cloud Tasks delivers the body as raw bytes; we parse + validate against
// AuditTaskPayloadSchema before invoking the pipeline runner. Concurrency is
// limited to 1 at the Cloud Run service level, so we don't enforce it here.

import express from 'express';
import { AuditTaskPayloadSchema } from '@cleartoship/shared-types';
import { runPipeline } from './pipeline/runner.js';
import { oidcMiddlewareFromEnv } from './auth/verify-oidc.js';
import { getToolsHealthSync, overallToolsStatus } from './diagnostics/tools-health.js';

const app = express();
app.use(express.json({ limit: '256kb' }));

app.get('/healthz', (_req, res) => {
  // Readiness signal — surface enough operational context for an SRE to tell
  // at a glance whether the worker is configured for production traffic
  // (OIDC enforced) or running in a relaxed dev mode (bypass active).
  // Env vars are read on every call so test suites (and runtime overrides)
  // see fresh values without restarting the process.
  const oidcEnabled = Boolean(
    process.env.OIDC_EXPECTED_AUDIENCE && process.env.OIDC_EXPECTED_ISSUER,
  );
  const devBypassActive =
    process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_BYPASS === '1';
  // External-tool probe is best-effort and synchronous (spawnSync). If it
  // throws for any reason we still return 200 with `tools: undefined` and
  // `status: 'degraded'` so operators see the rest of the readiness data.
  let tools: ReturnType<typeof getToolsHealthSync> | undefined;
  let toolsStatus: 'ok' | 'degraded' = 'ok';
  try {
    tools = getToolsHealthSync();
    toolsStatus = overallToolsStatus(tools);
  } catch {
    tools = undefined;
    toolsStatus = 'degraded';
  }
  res.status(200).json({
    // `status` stays 'ok' for backward compat with existing consumers;
    // tool degradation is surfaced via the dedicated `toolsStatus` field
    // so operators can spot a missing binary without breaking SRE alerts
    // that key off the top-level status string.
    status: 'ok',
    service: 'audit-worker',
    version: process.env.WORKER_VERSION ?? '0.1.0',
    nodeEnv: process.env.NODE_ENV ?? 'undefined',
    oidcEnabled,
    devBypassActive,
    toolsStatus,
    tools,
    timestamp: new Date().toISOString(),
  });
});

const verifyOidc = oidcMiddlewareFromEnv();

app.post('/run', verifyOidc, async (req, res) => {
  const parsed = AuditTaskPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Cloud Tasks payload invalid', issues: parsed.error.flatten() },
    });
    return;
  }

  // Acknowledge the Cloud Task quickly, then run the pipeline asynchronously.
  // Cloud Tasks treats any 2xx as success and any non-2xx as a retryable failure.
  // We respond 200 immediately and rely on Firestore status writes to surface
  // pipeline outcomes; the Cloud Tasks retry policy still kicks in if this
  // process crashes before responding.
  res.status(200).json({ accepted: true, runId: parsed.data.runId });

  try {
    await runPipeline(parsed.data);
  } catch (err) {
    process.stderr.write(
      JSON.stringify({
        level: 'error',
        component: 'worker.server',
        message: 'Pipeline crashed outside markRunFailed',
        runId: parsed.data.runId,
        error: err instanceof Error ? err.message : String(err),
      }) + '\n',
    );
  }
});

const port = Number(process.env.WORKER_PORT ?? 8080);
app.listen(port, () => {
  const devBypassActive =
    process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_BYPASS === '1';
  process.stderr.write(
    JSON.stringify({
      level: 'info',
      component: 'worker.server',
      message: `audit-worker listening on :${port}`,
      devBypassActive,
      nodeEnv: process.env.NODE_ENV ?? 'undefined',
    }) + '\n',
  );
});
