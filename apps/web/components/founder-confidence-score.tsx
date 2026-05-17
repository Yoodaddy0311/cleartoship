import type { Concern, FCSResult } from '@cleartoship/shared-types';
import { t, tf } from '@/lib/i18n';
import { severityToken, type Severity } from '@/lib/format/severity';

// Wave 1 W1.4 — Founder Confidence Score (FCS) display.
//
// FCS is a single 0~100 metric with an uncertainty band, a launch status chip,
// up to 3 ranked concerns, and a one-sentence rationale produced by audit-core
// (W1.2). The shared-types LaunchStatus 7-enum is UPPER_SNAKE — color tokens
// reuse the severity palette so the FCS chip stays consistent with the rest of
// the dashboard.
//
// INDETERMINATE branch suppresses the numeric gauge (same policy as
// ScoreOverview) so a thin-coverage run never surfaces a number as if it were
// a verdict — the uncertainty band still renders so the reader sees what
// signal we have.

type LaunchStatus7 = FCSResult['status'];

const STATUS_TOKEN: Record<LaunchStatus7, string> = {
  READY: 'var(--color-severity-p3)', // green
  CONDITIONAL: 'var(--color-severity-p2)', // lime/amber
  NEEDS_WORK: 'var(--color-severity-p1)', // amber
  AT_RISK: 'var(--color-severity-p1)', // orange (shares P1 token)
  NOT_READY: 'var(--color-severity-p0)', // red
  INDETERMINATE: 'var(--color-fg-muted)', // gray
  BLOCKED: 'var(--color-severity-p0)', // darkred (shares P0 token)
};

export interface FounderConfidenceScoreProps {
  readonly result: FCSResult;
}

export function FounderConfidenceScore({ result }: FounderConfidenceScoreProps) {
  const isIndeterminate = result.status === 'INDETERMINATE';
  const score = Math.round(result.score);
  const lower = Math.round(result.lower);
  const upper = Math.round(result.upper);
  const uncertainty = Math.round(result.uncertainty);

  return (
    <section
      aria-labelledby="fcs-heading"
      className="flex flex-col gap-5 rounded-mk border border-app-border bg-mk-bg-soft p-6"
    >
      <header className="flex flex-col gap-1">
        <h2
          id="fcs-heading"
          className="text-sm font-medium text-[color:var(--color-fg-muted)]"
        >
          {t('fcs.label.score')}
        </h2>
        <StatusChip status={result.status} />
      </header>

      <Gauge
        score={score}
        lower={lower}
        upper={upper}
        isIndeterminate={isIndeterminate}
      />

      <UncertaintyBar
        lower={lower}
        upper={upper}
        score={score}
        uncertainty={uncertainty}
        isIndeterminate={isIndeterminate}
      />

      {isIndeterminate ? (
        <p
          role="status"
          className="text-sm text-[color:var(--color-fg-muted)]"
          data-testid="fcs-indeterminate-note"
        >
          {t('fcs.label.indeterminateNote')}
        </p>
      ) : null}

      <Concerns concerns={result.topConcerns} />

      <Rationale text={result.rationale} />
    </section>
  );
}

function StatusChip({ status }: { status: LaunchStatus7 }) {
  const color = STATUS_TOKEN[status];
  const label = t(`fcs.status.${status}` as never);
  return (
    <span
      role="status"
      data-testid="fcs-status-chip"
      data-status={status}
      className="inline-flex h-7 max-w-fit items-center gap-1.5 rounded-full px-3 text-xs font-medium"
      style={{
        color,
        background: `color-mix(in oklch, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in oklch, ${color} 28%, transparent)`,
      }}
      aria-label={`${t('fcs.label.status')}: ${label}`}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      />
      <span>{label}</span>
    </span>
  );
}

function Gauge({
  score,
  lower,
  upper,
  isIndeterminate,
}: {
  score: number;
  lower: number;
  upper: number;
  isIndeterminate: boolean;
}) {
  if (isIndeterminate) {
    return (
      <div
        data-testid="fcs-gauge-indeterminate"
        role="img"
        aria-label={t('fcs.label.indeterminateNote')}
        className="flex h-[120px] w-[120px] items-center justify-center rounded-full border border-dashed border-[color:var(--color-border-default)] text-[color:var(--color-fg-muted)]"
      >
        <span className="font-mono text-2xl tabular-nums">N/A</span>
      </div>
    );
  }
  return (
    <div
      role="img"
      data-testid="fcs-gauge"
      aria-label={tf('fcs.aria.gauge', { score, lower, upper })}
      className="flex items-baseline gap-2"
    >
      <span className="font-mono text-6xl font-semibold tabular-nums text-[color:var(--color-fg-primary)]">
        {score}
      </span>
      <span className="text-sm text-[color:var(--color-fg-muted)]">/ 100</span>
    </div>
  );
}

function UncertaintyBar({
  lower,
  upper,
  score,
  uncertainty,
  isIndeterminate,
}: {
  lower: number;
  upper: number;
  score: number;
  uncertainty: number;
  isIndeterminate: boolean;
}) {
  const leftPct = Math.max(0, Math.min(100, lower));
  const widthPct = Math.max(0, Math.min(100 - leftPct, upper - lower));
  const scorePct = Math.max(0, Math.min(100, score));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-xs text-[color:var(--color-fg-muted)]">
        <span>{tf('fcs.label.uncertainty', { value: uncertainty })}</span>
        <span className="font-mono tabular-nums">
          {lower}–{upper}
        </span>
      </div>
      <div
        role="img"
        data-testid="fcs-uncertainty-bar"
        aria-label={tf('fcs.aria.uncertaintyBar', { lower, upper })}
        className="relative h-2 w-full rounded-full bg-[color:var(--color-bg-subtle)]"
      >
        <div
          className="absolute top-0 h-full rounded-full bg-[color:var(--color-fg-muted)] opacity-50"
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
          aria-hidden="true"
        />
        {isIndeterminate ? null : (
          <div
            data-testid="fcs-uncertainty-marker"
            className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-[color:var(--color-fg-primary)]"
            style={{ left: `${scorePct}%` }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}

function Concerns({ concerns }: { concerns: readonly Concern[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-[color:var(--color-fg-secondary)]">
        {t('fcs.label.topConcerns')}
      </h3>
      {concerns.length === 0 ? (
        <p className="text-sm text-[color:var(--color-fg-muted)]">
          {t('fcs.empty.concerns')}
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {concerns.map((c, idx) => (
            <li
              key={c.findingId}
              data-testid="fcs-concern"
              className="flex items-center gap-2 text-sm"
            >
              <span
                aria-hidden="true"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-bg-subtle)] font-mono text-xs tabular-nums text-[color:var(--color-fg-muted)]"
              >
                {idx + 1}
              </span>
              <SeverityChip severity={c.severity} />
              <span className="truncate text-[color:var(--color-fg-primary)]">
                {c.ruleFamily}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function SeverityChip({ severity }: { severity: Severity }) {
  const color = severityToken(severity);
  return (
    <span
      data-testid="fcs-severity-chip"
      data-severity={severity}
      className="inline-flex h-5 shrink-0 items-center rounded px-1.5 font-mono text-[10px] font-semibold tabular-nums"
      style={{
        color,
        background: `color-mix(in oklch, ${color} 14%, transparent)`,
      }}
      aria-label={severity}
    >
      {severity}
    </span>
  );
}

function Rationale({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-medium text-[color:var(--color-fg-secondary)]">
        {t('fcs.label.rationale')}
      </h3>
      <p className="text-sm leading-[1.55] text-[color:var(--color-fg-secondary)]">
        {text}
      </p>
    </div>
  );
}
