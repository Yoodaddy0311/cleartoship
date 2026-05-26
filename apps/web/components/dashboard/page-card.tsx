// Phase G.4 — PageCard (single page tile)
//
// One tile = one page from the audited repo's `RouteInventory`. Composed
// into `PageCardGrid` to render the full inventory. Intentionally NOT
// reusing `Card` from @cleartoship/ui because:
//   - We want consistent dimensions across the grid (PageCardGrid pins min
//     height so a row never jitters when one card has more chips).
//   - The page card is content-density-tight; CardHeader/CardBody's default
//     spacing leaves too much whitespace at the small sizes we render at.
//
// MVP responsibilities (per briefing):
//   - Route path (truncated, monospace for legibility).
//   - Status badge slot — Phase 2 fills with health (LCP, accessibility, etc).
//     Today we render `findingCount`-driven badge when findings prop given,
//     otherwise an "준비 중" placeholder so non-devs see the slot exists.
//   - Component-count placeholder ("컴포넌트 N개 분석 예정") — Phase 2 fills.
//   - Framework/dynamic chips so power users see structural intent.
//
// Click handler is a normal native button → keyboard / screen reader for free.

'use client';

import type { RouteEntry } from '@cleartoship/shared-types';

export interface PageCardProps {
  entry: RouteEntry;
  /**
   * Number of findings attributed to this page. Optional — when omitted,
   * the card renders a "준비 중" status placeholder so the slot is visible.
   * Phase 2 wires real per-page health here.
   */
  findingCount?: number;
  selected?: boolean;
  /**
   * Stable id (from `routeEntryId(entry)`) returned to the caller. Defined
   * here as `string` so callers can use any format; PageCardGrid passes the
   * canonical id from `repo-tree-view`.
   */
  routeId: string;
  onSelect?: (routeId: string) => void;
}

export function PageCard({
  entry,
  findingCount,
  selected = false,
  routeId,
  onSelect,
}: PageCardProps) {
  const isInteractive = typeof onSelect === 'function';
  const statusTone = resolveStatusTone(findingCount);

  const body = (
    <div className="flex h-full min-h-[140px] flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <span
          className="ko-text truncate font-mono text-sm font-medium text-[color:var(--app-fg)]"
          title={entry.urlPath}
        >
          {entry.urlPath}
        </span>
        <StatusBadge tone={statusTone.tone} label={statusTone.label} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <FrameworkChip framework={entry.framework} />
        {entry.hasDynamic ? <Chip>동적</Chip> : null}
        {entry.hasCatchAll ? <Chip>catch-all</Chip> : null}
        {entry.exportedMethods && entry.exportedMethods.length > 0
          ? entry.exportedMethods.map((m) => <Chip key={m}>{m}</Chip>)
          : null}
      </div>

      <p className="mt-auto text-xs text-[color:var(--color-fg-muted)]">
        컴포넌트 분석은 Phase 2에서 제공됩니다.
      </p>
    </div>
  );

  const baseClass =
    'flex h-full flex-col rounded-[12px] border bg-[color:var(--app-surface)] p-4 text-left shadow-[var(--elev-1)] transition-colors';
  const stateClass = selected
    ? 'border-[color:var(--mk-accent-2)] ring-2 ring-[color:var(--mk-accent-2)] ring-offset-1'
    : 'border-[color:var(--app-border)] hover:border-[color-mix(in_oklch,var(--mk-accent-2)_45%,var(--app-border))]';

  if (!isInteractive) {
    return (
      <div
        data-testid={`page-card-${routeId}`}
        data-route-id={routeId}
        className={`${baseClass} ${stateClass}`}
      >
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      data-testid={`page-card-${routeId}`}
      data-route-id={routeId}
      aria-pressed={selected}
      aria-label={`페이지 ${entry.urlPath}`}
      onClick={() => onSelect(routeId)}
      className={`${baseClass} ${stateClass} focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]`}
    >
      {body}
    </button>
  );
}

type StatusTone = 'pending' | 'clean' | 'warn' | 'risk';

function resolveStatusTone(findingCount: number | undefined): {
  tone: StatusTone;
  label: string;
} {
  if (findingCount === undefined) {
    return { tone: 'pending', label: '준비 중' };
  }
  if (findingCount === 0) {
    return { tone: 'clean', label: '문제 없음' };
  }
  if (findingCount <= 2) {
    return { tone: 'warn', label: `${findingCount}건 발견` };
  }
  return { tone: 'risk', label: `${findingCount}건 발견` };
}

function StatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
  const toneClass: Record<StatusTone, string> = {
    pending:
      'bg-[color:var(--app-chip-bg)] text-[color:var(--color-fg-muted)]',
    clean:
      'bg-[color-mix(in_oklch,var(--color-severity-p3)_18%,transparent)] text-[color:var(--color-severity-p3)]',
    warn:
      'bg-[color-mix(in_oklch,var(--color-severity-p2)_18%,transparent)] text-[color:var(--color-severity-p2)]',
    risk:
      'bg-[color-mix(in_oklch,var(--color-severity-p0)_18%,transparent)] text-[color:var(--color-severity-p0)]',
  };
  return (
    <span
      data-testid={`page-card-status-${tone}`}
      data-tone={tone}
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide ${toneClass[tone]}`}
    >
      {label}
    </span>
  );
}

function FrameworkChip({ framework }: { framework: RouteEntry['framework'] }) {
  const label: Record<RouteEntry['framework'], string> = {
    'next-app': 'App Router',
    'next-app-api': 'App Router API',
    'next-pages': 'Pages Router',
    'next-pages-api': 'Pages API',
    express: 'Express',
    fastify: 'Fastify',
    hono: 'Hono',
    unknown: 'Unknown',
  };
  return <Chip>{label[framework]}</Chip>;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded bg-[color:var(--app-chip-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--color-fg-muted)]">
      {children}
    </span>
  );
}
