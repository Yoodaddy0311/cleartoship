// T2.5 — Re-audit diff visualization.
//
// Server-side data: caller resolves `RunDiff` via `computeRunDiff(...)` from
// shared-types and passes the result here. The component is purely
// presentational — no data fetching, no React Query, no Firestore. Keeps it
// testable with plain props and easy to reuse from a future
// `/audit-runs/[id]/diff` server component.

import { Card, CardBody } from '@cleartoship/ui';
import type {
  CategoryDelta,
  FindingChange,
  RunDiff,
  SeverityDelta,
} from '@cleartoship/shared-types';
import { AUDIT_CATEGORY_LABELS_KO } from '@cleartoship/shared-types';

export interface DiffViewProps {
  diff: RunDiff;
  /** Optional explicit copy hooks (i18n indirection); falls back to KO defaults. */
  labels?: {
    title?: string;
    scoreHeading?: string;
    severityHeading?: string;
    categoryHeading?: string;
    findingsHeading?: string;
    emptyChanges?: string;
  };
}

function formatDelta(delta: number | null): string {
  if (delta === null) return '—';
  if (delta === 0) return '±0';
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function deltaToneClass(delta: number | null, kind: 'score' | 'severity'): string {
  // For score: positive delta = better → green. For severity counts: positive
  // delta = MORE findings of that level → worse → red.
  if (delta === null || delta === 0) return 'text-[color:var(--color-fg-muted)]';
  const isPositive = delta > 0;
  if (kind === 'score') {
    return isPositive
      ? 'text-[color:var(--color-success-fg,#0a7d31)]'
      : 'text-[color:var(--color-danger-fg,#b3261e)]';
  }
  return isPositive
    ? 'text-[color:var(--color-danger-fg,#b3261e)]'
    : 'text-[color:var(--color-success-fg,#0a7d31)]';
}

function ScoreDeltaPanel({ diff, heading }: { diff: RunDiff; heading: string }) {
  return (
    <Card variant="default" padding="md" data-testid="diff-score-panel">
      <CardBody>
        <h3 className="mb-2 text-sm font-medium text-[color:var(--color-fg-muted)]">
          {heading}
        </h3>
        <div className="flex items-baseline gap-4">
          <span className="font-mono text-3xl tabular-nums text-[color:var(--color-fg-primary)]">
            {diff.previousScore ?? 'N/A'}
            <span aria-hidden className="mx-2 text-[color:var(--color-fg-muted)]">
              →
            </span>
            {diff.currentScore ?? 'N/A'}
          </span>
          <span
            data-testid="diff-score-delta"
            className={`font-mono text-base tabular-nums ${deltaToneClass(diff.scoreDelta, 'score')}`}
            aria-label={`점수 변화 ${formatDelta(diff.scoreDelta)}`}
          >
            Δ {formatDelta(diff.scoreDelta)}
          </span>
        </div>
      </CardBody>
    </Card>
  );
}

function SeverityDeltaRow({ row }: { row: SeverityDelta }) {
  return (
    <li
      data-testid={`diff-severity-${row.severity}`}
      className="flex items-center justify-between border-b border-[color:var(--app-border)] py-2 last:border-b-0"
    >
      <span className="font-mono text-sm text-[color:var(--color-fg-primary)]">
        {row.severity}
      </span>
      <span className="font-mono text-sm tabular-nums text-[color:var(--color-fg-secondary)]">
        {row.previous} → {row.current}
      </span>
      <span
        className={`font-mono text-sm tabular-nums ${deltaToneClass(row.delta, 'severity')}`}
        aria-label={`${row.severity} 변화 ${formatDelta(row.delta)}`}
      >
        {formatDelta(row.delta)}
      </span>
    </li>
  );
}

function CategoryDeltaRow({ row }: { row: CategoryDelta }) {
  // For categories the score's "up is good" semantic matches score panel.
  return (
    <li
      data-testid={`diff-category-${row.category}`}
      className="flex items-center justify-between gap-3 border-b border-[color:var(--app-border)] py-2 last:border-b-0"
    >
      <span className="truncate text-sm text-[color:var(--color-fg-primary)]">
        {AUDIT_CATEGORY_LABELS_KO[row.category]?.label ?? row.label}
      </span>
      <span className="font-mono text-sm tabular-nums text-[color:var(--color-fg-secondary)]">
        {row.previous ?? 'N/A'} → {row.current ?? 'N/A'}
      </span>
      <span
        className={`min-w-[3rem] text-right font-mono text-sm tabular-nums ${deltaToneClass(row.delta, 'score')}`}
        aria-label={`${row.category} 변화 ${formatDelta(row.delta)}`}
      >
        {formatDelta(row.delta)}
      </span>
    </li>
  );
}

function changeKindLabel(kind: FindingChange['kind']): string {
  if (kind === 'added') return '신규';
  if (kind === 'removed') return '해결';
  return '변경';
}

function changeKindClass(kind: FindingChange['kind']): string {
  if (kind === 'added') return 'bg-[color:var(--color-danger-bg,#fdecea)] text-[color:var(--color-danger-fg,#b3261e)]';
  if (kind === 'removed') return 'bg-[color:var(--color-success-bg,#e6f4ea)] text-[color:var(--color-success-fg,#0a7d31)]';
  return 'bg-[color:var(--color-warning-bg,#fff4e5)] text-[color:var(--color-warning-fg,#a26200)]';
}

function FindingChangeRow({ change }: { change: FindingChange }) {
  const display = change.current ?? change.previous;
  if (!display) return null;
  return (
    <li
      data-testid={`diff-finding-${change.kind}-${change.matchKey}`}
      className="flex items-start gap-3 border-b border-[color:var(--app-border)] py-3 last:border-b-0"
    >
      <span
        className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${changeKindClass(change.kind)}`}
        data-testid={`diff-kind-${change.kind}`}
      >
        {changeKindLabel(change.kind)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-[color:var(--color-fg-primary)]">
          {display.title}
        </p>
        <p className="text-xs text-[color:var(--color-fg-muted)]">
          {display.category} · {display.severity}
          {change.kind === 'changed' && change.changedFields.length > 0 ? (
            <>
              {' · '}
              <span data-testid="diff-changed-fields">
                변경: {change.changedFields.join(', ')}
              </span>
            </>
          ) : null}
        </p>
      </div>
    </li>
  );
}

export function DiffView({ diff, labels }: DiffViewProps) {
  const t = {
    title: labels?.title ?? '재감사 변화',
    scoreHeading: labels?.scoreHeading ?? '출시 준비도 점수',
    severityHeading: labels?.severityHeading ?? '심각도별 변화',
    categoryHeading: labels?.categoryHeading ?? '카테고리별 변화',
    findingsHeading: labels?.findingsHeading ?? '항목 변화',
    emptyChanges: labels?.emptyChanges ?? '이전 감사 대비 새로운 항목 변화가 없습니다.',
  };

  return (
    <section
      data-testid="diff-view"
      aria-label="재감사 diff"
      className="flex flex-col gap-4"
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-[color:var(--color-fg-primary)]">
          {t.title}
        </h2>
        <p className="text-xs text-[color:var(--color-fg-muted)]">
          이전 감사 ID: <span className="font-mono">{diff.previousRunId}</span>
        </p>
        <p
          className="text-sm text-[color:var(--color-fg-secondary)]"
          data-testid="diff-totals-summary"
        >
          <span className="text-[color:var(--color-danger-fg,#b3261e)]">
            +{diff.totals.added} 신규
          </span>
          {' · '}
          <span className="text-[color:var(--color-success-fg,#0a7d31)]">
            -{diff.totals.removed} 해결
          </span>
          {' · '}
          <span className="text-[color:var(--color-warning-fg,#a26200)]">
            ~{diff.totals.changed} 변경
          </span>
          {' · '}
          <span className="text-[color:var(--color-fg-muted)]">
            {diff.totals.unchanged} 동일
          </span>
        </p>
      </header>

      <ScoreDeltaPanel diff={diff} heading={t.scoreHeading} />

      <Card variant="default" padding="md" data-testid="diff-severity-panel">
        <CardBody>
          <h3 className="mb-2 text-sm font-medium text-[color:var(--color-fg-muted)]">
            {t.severityHeading}
          </h3>
          <ul className="flex flex-col">
            {diff.severityDeltas.map((d) => (
              <SeverityDeltaRow key={d.severity} row={d} />
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card variant="default" padding="md" data-testid="diff-category-panel">
        <CardBody>
          <h3 className="mb-2 text-sm font-medium text-[color:var(--color-fg-muted)]">
            {t.categoryHeading}
          </h3>
          {diff.categoryDeltas.length === 0 ? (
            <p className="text-sm text-[color:var(--color-fg-muted)]">{t.emptyChanges}</p>
          ) : (
            <ul className="flex flex-col">
              {diff.categoryDeltas.map((d) => (
                <CategoryDeltaRow key={d.category} row={d} />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card variant="default" padding="md" data-testid="diff-findings-panel">
        <CardBody>
          <h3 className="mb-2 text-sm font-medium text-[color:var(--color-fg-muted)]">
            {t.findingsHeading}
          </h3>
          {diff.findingChanges.length === 0 ? (
            <p
              data-testid="diff-findings-empty"
              className="text-sm text-[color:var(--color-fg-muted)]"
            >
              {t.emptyChanges}
            </p>
          ) : (
            <ul className="flex flex-col">
              {diff.findingChanges.map((c) => (
                <FindingChangeRow key={c.matchKey} change={c} />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </section>
  );
}
