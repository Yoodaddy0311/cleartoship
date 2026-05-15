// Cloud Run HTTP entrypoint — accepts Cloud Tasks payloads at POST /run.
//
// Cloud Tasks delivers the body as raw bytes; we parse + validate against
// AuditTaskPayloadSchema before invoking the pipeline runner. Concurrency is
// limited to 1 at the Cloud Run service level, so we don't enforce it here.

import express from 'express';
import { AuditTaskPayloadSchema } from '@cleartoship/shared-types';
import { runPipeline } from './pipeline/runner.js';
import { oidcMiddlewareFromEnv } from './auth/verify-oidc.js';

const app = express();
app.use(express.json({ limit: '256kb' }));

app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok' });
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
  process.stderr.write(
    JSON.stringify({
      level: 'info',
      component: 'worker.server',
      message: `audit-worker listening on :${port}`,
    }) + '\n',
  );
});
