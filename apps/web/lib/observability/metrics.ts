// Cloud Monitoring custom metric emitter for apps/web (T1.1c-FU).
//
// Mirrors the pattern in workers/audit-worker/src/observability/metrics.ts —
// both modules MUST keep METRIC_NAMES in sync with
// infra/terraform/monitoring.tf so descriptors and emit calls line up.
//
// This module exists separately from the worker emitter because the web tier
// runs on a different Cloud Run service (and a different package), but emits
// against the same project / metric descriptors.
//
// Safety properties
// ─────────────────
// 1. Lazy-loads @google-cloud/monitoring only when ENABLE_METRICS=1 — the
//    Next.js cold path stays small in dev / preview when the dependency is
//    absent or credentials are missing.
// 2. Best-effort fire-and-forget: every emit is wrapped in try/catch and
//    logged at warn level. A failed metric write must NEVER fail the request.
// 3. No-op when metrics are disabled or when GCP credentials are missing —
//    so `pnpm dev` on a laptop without ADC keeps working.

const PREFIX = 'custom.googleapis.com/cleartoship';

export const METRIC_NAMES = {
  /** Gauge: current count of audit runs reserved in today's UTC bucket. */
  AUDIT_RUN_DAILY_QUOTA_USED: `${PREFIX}/audit_run_daily_quota_used`,
  /** Gauge: effective daily cap (env override or default). Same labels as USED. */
  AUDIT_RUN_DAILY_QUOTA_MAX: `${PREFIX}/audit_run_daily_quota_max`,
} as const;

export type MetricName = (typeof METRIC_NAMES)[keyof typeof METRIC_NAMES];

interface MetricsConfig {
  readonly enabled: boolean;
  readonly projectId: string | undefined;
}

function readConfig(): MetricsConfig {
  return {
    enabled: process.env.ENABLE_METRICS === '1',
    projectId:
      process.env.GOOGLE_CLOUD_PROJECT ??
      process.env.GCLOUD_PROJECT ??
      process.env.PROJECT_ID,
  };
}

interface TimeSeriesPoint {
  readonly metricType: MetricName;
  readonly labels: Readonly<Record<string, string>>;
  readonly value: number;
  readonly kind: 'gauge';
}

let clientPromise: Promise<unknown> | null = null;

async function getClient(): Promise<unknown> {
  if (clientPromise) return clientPromise;
  clientPromise = (async () => {
    const mod = await import('@google-cloud/monitoring');
    return new mod.MetricServiceClient();
  })();
  return clientPromise;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

async function emit(point: TimeSeriesPoint): Promise<void> {
  const cfg = readConfig();
  if (!cfg.enabled || !cfg.projectId) return;

  try {
    const client = (await getClient()) as {
      projectPath(p: string): string;
      createTimeSeries(req: unknown): Promise<unknown>;
    };
    const seconds = nowSeconds();
    await client.createTimeSeries({
      name: client.projectPath(cfg.projectId),
      timeSeries: [
        {
          metric: { type: point.metricType, labels: point.labels },
          resource: {
            type: 'global',
            labels: { project_id: cfg.projectId },
          },
          metricKind: 'GAUGE',
          points: [
            {
              interval: { endTime: { seconds } },
              // INT64 descriptor → use int64Value so the wire type matches the
              // descriptor declared in monitoring.tf. doubleValue would still
              // accept but raise a warn-level type mismatch in Cloud Monitoring.
              value: { int64Value: point.value },
            },
          ],
        },
      ],
    });
  } catch (err) {
    process.stderr.write(
      JSON.stringify({
        level: 'warn',
        component: 'web.metrics',
        message: 'Metric emit failed (best-effort)',
        metric: point.metricType,
        error: err instanceof Error ? err.message : String(err),
      }) + '\n',
    );
  }
}

/**
 * Emit the current daily-quota bucket usage. Called from
 * `reserveDailyQuotaSlot` on every request (both allowed and denied) so the
 * 80% threshold alert (monitoring.tf:daily_quota_usage) can react before the
 * cap is fully hit. `bucketId` (YYYY-MM-DD) is attached as a label so a single
 * dashboard panel can show consecutive days side by side.
 */
export function recordDailyQuotaUsage(
  used: number,
  max: number,
  bucketId: string,
): void {
  void emit({
    metricType: METRIC_NAMES.AUDIT_RUN_DAILY_QUOTA_USED,
    labels: { bucket_id: bucketId },
    value: used,
    kind: 'gauge',
  });
  void emit({
    metricType: METRIC_NAMES.AUDIT_RUN_DAILY_QUOTA_MAX,
    labels: { bucket_id: bucketId },
    value: max,
    kind: 'gauge',
  });
}

export function isMetricsEnabled(): boolean {
  return readConfig().enabled;
}

export function __resetClientForTests(): void {
  clientPromise = null;
}
