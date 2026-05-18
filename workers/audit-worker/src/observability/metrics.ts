// Cloud Monitoring custom metric emitter for the audit-worker (T2.13).
//
// Metric names mirror infra/terraform/monitoring.tf — both sides MUST keep
// METRIC_NAMES in sync. The Terraform module creates google_monitoring_metric_descriptor
// resources for each name below; the alert policies key off the same MetricKind.
//
// Safety properties
// ─────────────────
// 1. Lazy-loads @google-cloud/monitoring only when ENABLE_METRICS=1 — keeps
//    cold-start small in dev / test environments without the dependency.
// 2. Best-effort fire-and-forget: every emit is wrapped in try/catch and
//    logged at warn level. A failed metric write must NEVER fail the audit.
// 3. No-op when metrics are disabled or when GCP credentials are missing —
//    so the worker keeps running on a laptop without ADC configured.

const PREFIX = 'custom.googleapis.com/cleartoship';

export const METRIC_NAMES = {
  /** Distribution: end-to-end audit run duration in seconds. */
  AUDIT_RUN_DURATION: `${PREFIX}/audit_run_duration_seconds`,
  /** Counter: completed audit runs, label `status` ∈ {COMPLETED,FAILED}. */
  AUDIT_RUN_COMPLETED: `${PREFIX}/audit_run_completed_total`,
  /** Counter: BLOCKED audit runs, label `abort_reason` ∈ {REPO_TOO_LARGE,...}. */
  AUDIT_RUN_BLOCKED: `${PREFIX}/audit_run_blocked_total`,
  /** Gauge: Cloud Tasks queue depth (mirror of cloudtasks.googleapis.com built-in). */
  QUEUE_DEPTH: `${PREFIX}/queue_depth`,
  /** Distribution: Lighthouse step latency in seconds, label `profile`. */
  LIGHTHOUSE_LATENCY: `${PREFIX}/lighthouse_latency_seconds`,
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
  readonly kind: 'gauge' | 'cumulative';
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
    const interval =
      point.kind === 'cumulative'
        ? { startTime: { seconds: seconds - 1 }, endTime: { seconds } }
        : { endTime: { seconds } };

    await client.createTimeSeries({
      name: client.projectPath(cfg.projectId),
      timeSeries: [
        {
          metric: { type: point.metricType, labels: point.labels },
          resource: {
            type: 'global',
            labels: { project_id: cfg.projectId },
          },
          metricKind: point.kind === 'cumulative' ? 'CUMULATIVE' : 'GAUGE',
          points: [
            {
              interval,
              value: { doubleValue: point.value },
            },
          ],
        },
      ],
    });
  } catch (err) {
    process.stderr.write(
      JSON.stringify({
        level: 'warn',
        component: 'worker.metrics',
        message: 'Metric emit failed (best-effort)',
        metric: point.metricType,
        error: err instanceof Error ? err.message : String(err),
      }) + '\n',
    );
  }
}

export function recordAuditDuration(seconds: number, status: string): void {
  void emit({
    metricType: METRIC_NAMES.AUDIT_RUN_DURATION,
    labels: { status },
    value: seconds,
    kind: 'gauge',
  });
}

export function incrementAuditCompleted(status: string): void {
  void emit({
    metricType: METRIC_NAMES.AUDIT_RUN_COMPLETED,
    labels: { status },
    value: 1,
    kind: 'cumulative',
  });
}

export function incrementAuditBlocked(abortReason: string): void {
  void emit({
    metricType: METRIC_NAMES.AUDIT_RUN_BLOCKED,
    labels: { abort_reason: abortReason },
    value: 1,
    kind: 'cumulative',
  });
}

export function recordLighthouseLatency(seconds: number, profile: string): void {
  void emit({
    metricType: METRIC_NAMES.LIGHTHOUSE_LATENCY,
    labels: { profile },
    value: seconds,
    kind: 'gauge',
  });
}

export function isMetricsEnabled(): boolean {
  return readConfig().enabled;
}

export function __resetClientForTests(): void {
  clientPromise = null;
}
