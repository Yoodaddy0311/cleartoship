import { useCallback, useState } from 'react';
import { ScoreGauge } from '@cleartoship/ui';
import type { ScoreOrigin } from '@cleartoship/shared-types';
import {
  ALL_CATEGORIES,
  categoryLabel,
  type AuditCategory,
} from '@/lib/format/category';
import { LaunchStatusChip } from '@/components/common/launch-status-chip';
import type { LaunchStatus } from '@/lib/format/status';
import { t } from '@/lib/i18n';

function chipFor(score: number): LaunchStatus {
  if (score >= 80) return 'ready';
  if (score >= 60) return 'ready_with_improvements';
  if (score >= 40) return 'needs_work';
  return 'stop';
}

/**
 * W2.C6.1 — 2×6 CategoryGrid.
 *
 * Layout:
 *  - mobile (`<sm`): 1 col stack
 *  - sm: 2 cols
 *  - lg+: **6 cols × 2 rows = 12 cells** (11 audit categories + 1 reserved
 *    placeholder cell to fill the grid evenly).
 *
 * Props:
 *  - `scores` — required. `null` value = N/A (coverage signal too thin),
 *    rendered as an N/A tile (no score gauge, no verdict chip — so a 0점
 *    mis-render never happens).
 *  - `weights` — optional. If a category's weight is exactly `0`, its tile
 *    is dimmed (opacity-50), non-clickable, and gets a `title` tooltip
 *    explaining that the active audit profile excludes it. Categories
 *    omitted from `weights` are treated as "unspecified" (no dimming).
 *  - `onCategoryClick` — optional. When provided, tiles become clickable
 *    buttons with `aria-pressed` reflecting the currently-selected category
 *    (single-select toggle). Weight=0 tiles are never clickable. When
 *    absent, tiles render as static divs.
 *
 * TODO(Wave 3 §A.4.4): replace ALL_CATEGORIES enum order with
 * tie-break-resolved ranking once primaryPath fallback is implemented in
 * audit-core. Today the order is the static enum order from
 * `lib/format/category.ts`, which is fine for an unweighted view but
 * does not surface "primary contributor" categories first when two
 * categories tie on score.
 */
export function CategoryGrid({
  scores,
  weights,
  origins,
  onCategoryClick,
}: {
  scores: Record<AuditCategory, number | null>;
  weights?: Partial<Record<AuditCategory, number>>;
  /**
   * PR-A4 — per-category score origin (D/F/L/mixed/none). Optional for
   * backward compatibility; absent or `none` renders no badge.
   */
  origins?: Partial<Record<AuditCategory, ScoreOrigin>>;
  onCategoryClick?: (category: AuditCategory) => void;
}) {
  const [selected, setSelected] = useState<AuditCategory | null>(null);

  const handleClick = useCallback(
    (cat: AuditCategory) => {
      setSelected((cur) => (cur === cat ? null : cat));
      onCategoryClick?.(cat);
    },
    [onCategoryClick],
  );

  // TODO(Wave 3 §A.4.4): replace ALL_CATEGORIES enum order with
  // tie-break-resolved ranking once primaryPath fallback is implemented in
  // audit-core.
  const orderedCategories = ALL_CATEGORIES;

  return (
    <div
      data-testid="category-grid"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6"
    >
      {orderedCategories.map((c) => {
        const s = scores[c];
        const w = weights?.[c];
        const o = origins?.[c];
        const isZeroWeighted = w === 0;
        const clickable =
          typeof onCategoryClick === 'function' && !isZeroWeighted;
        const isSelected = selected === c;
        return (
          <CategoryCell
            key={c}
            category={c}
            score={s ?? null}
            weight={w}
            origin={o}
            zeroWeight={isZeroWeighted}
            clickable={clickable}
            selected={isSelected}
            onClick={clickable ? () => handleClick(c) : undefined}
          />
        );
      })}
      {/* 12th cell — placeholder so 11 categories fill an even 2×6 grid */}
      <PlaceholderCell />
    </div>
  );
}

/**
 * A single category tile. Renders either an interactive `<button>` (when
 * `clickable`) or a static `<div>`. Visual treatment is identical aside
 * from focus ring + selected outline.
 */
function CategoryCell({
  category,
  score,
  weight,
  origin,
  zeroWeight,
  clickable,
  selected,
  onClick,
}: {
  category: AuditCategory;
  score: number | null;
  weight: number | undefined;
  origin: ScoreOrigin | undefined;
  zeroWeight: boolean;
  clickable: boolean;
  selected: boolean;
  onClick?: () => void;
}) {
  const label = categoryLabel(category);
  const tooltip = zeroWeight ? t('category.grid.weight.zero.tooltip') : undefined;

  const dimClass = zeroWeight
    ? 'opacity-50 cursor-not-allowed'
    : '';
  const selectedClass = selected
    ? 'ring-2 ring-[color:var(--app-focus)] ring-offset-1'
    : '';

  // Inner tile content — N/A tile when score is null, else ScoreGauge.
  // ScoreGauge's existing API doesn't expose an "origin badge" slot, so we
  // overlay the badge in a sibling layer positioned at top-right of the
  // cell. Only renders for D/F/L/mixed — `none` and `undefined` skip.
  const showBadge = origin && origin !== 'none';
  const inner =
    score === null ? (
      <CategoryNATile label={label} />
    ) : (
      <div className="relative">
        <ScoreGauge
          label={label}
          score={score}
          weight={weight}
          chip={<LaunchStatusChip status={chipFor(score)} />}
        />
        {showBadge ? <OriginBadge origin={origin} /> : null}
      </div>
    );

  const wrapperClass = `relative ${dimClass} ${selectedClass}`.trim();
  const dataAttrs = {
    'data-testid': `category-cell-${category}`,
    'data-category': category,
    'data-zero-weight': zeroWeight ? 'true' : undefined,
  };

  if (clickable) {
    return (
      <button
        type="button"
        aria-pressed={selected}
        aria-label={label}
        onClick={onClick}
        className={`block w-full text-left rounded-[10px] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${wrapperClass}`}
        title={tooltip}
        {...dataAttrs}
      >
        {inner}
      </button>
    );
  }

  return (
    <div
      className={wrapperClass}
      title={tooltip}
      aria-label={zeroWeight ? `${label} — ${tooltip}` : undefined}
      {...dataAttrs}
    >
      {inner}
    </div>
  );
}

/**
 * 12th cell — a visual placeholder so the 11 categories sit in a clean 2×6
 * grid on lg+ breakpoints. It is decorative; screen readers skip it via
 * `aria-hidden`.
 */
function PlaceholderCell() {
  return (
    <div
      data-testid="category-placeholder-cell"
      aria-hidden="true"
      className="hidden lg:flex flex-col gap-2 rounded-[10px] border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4 opacity-60"
    >
      <span className="text-sm text-[color:var(--app-fg-muted)]">
        {t('category.grid.placeholder.label')}
      </span>
      <span className="text-xs text-[color:var(--app-fg-muted)]">
        {t('category.grid.placeholder.hint')}
      </span>
    </div>
  );
}

/**
 * PR-A4 — score-origin badge rendered in the top-right of a CategoryCell.
 * Drives the "where did this number come from" UX surfaced in PRD §6:
 *   📦 D     — deterministic code analysis (file glob / AST)
 *   🌐 F     — free external API (GitHub metadata, OSV.dev)
 *   🤖 L     — LLM-derived (Claude / OpenAI) — Phase B
 *   ⚙️ mixed — both deterministic findings and inventory signal contributed
 *
 * `title` (native HTML tooltip) carries the i18n explanation for users who
 * hover the icon. We deliberately don't add a separate "?" affordance —
 * the badge itself is the affordance, and screen readers get the `aria-label`.
 */
function OriginBadge({ origin }: { origin: ScoreOrigin }) {
  if (origin === 'none') return null;
  const icon =
    origin === 'D' ? '📦' : origin === 'F' ? '🌐' : origin === 'L' ? '🤖' : '⚙️';
  const ariaLabel = t(`category.origin.${origin}.aria`);
  const tooltip = t(`category.origin.${origin}.tooltip`);
  return (
    <span
      data-testid={`origin-badge-${origin}`}
      data-origin={origin}
      aria-label={ariaLabel}
      title={tooltip}
      className="absolute right-2 top-2 inline-flex items-center justify-center rounded-md bg-[color:var(--app-surface)] px-1.5 py-0.5 text-xs leading-none shadow-sm pointer-events-auto"
    >
      <span aria-hidden="true">{icon}</span>
    </span>
  );
}

function CategoryNATile({ label }: { label: string }) {
  return (
    <div
      data-testid="category-na-tile"
      className="flex flex-col gap-2 rounded-[10px] border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-[color:var(--app-fg-muted)]">{label}</span>
        <span className="text-xs text-[color:var(--color-fg-muted)]">{t('category.na.label')}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span
          aria-label={`${label} ${t('category.na.label')}`}
          className="font-mono tabular-nums text-[color:var(--color-fg-muted)]"
          style={{ fontSize: '1.5rem', fontWeight: 600 }}
        >
          N/A
        </span>
        <span className="text-xs text-[color:var(--app-fg-muted)]">/ 100</span>
      </div>
      <p className="text-xs text-[color:var(--color-fg-muted)]">
        {t('category.na.description')}
      </p>
    </div>
  );
}
