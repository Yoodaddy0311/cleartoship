import { useCallback, useState } from 'react';
import { ScoreGauge } from '@cleartoship/ui';
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
  onCategoryClick,
}: {
  scores: Record<AuditCategory, number | null>;
  weights?: Partial<Record<AuditCategory, number>>;
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
  zeroWeight,
  clickable,
  selected,
  onClick,
}: {
  category: AuditCategory;
  score: number | null;
  weight: number | undefined;
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
  const inner =
    score === null ? (
      <CategoryNATile label={label} />
    ) : (
      <ScoreGauge
        label={label}
        score={score}
        weight={weight}
        chip={<LaunchStatusChip status={chipFor(score)} />}
      />
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

function CategoryNATile({ label }: { label: string }) {
  return (
    <div
      data-testid="category-na-tile"
      className="flex flex-col gap-2 rounded-[10px] border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-[color:var(--app-fg-muted)]">{label}</span>
        <span className="text-xs text-[color:var(--color-fg-muted)]">판단 불가</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span
          aria-label={`${label} 점수 판단 불가`}
          className="font-mono tabular-nums text-[color:var(--color-fg-muted)]"
          style={{ fontSize: '1.5rem', fontWeight: 600 }}
        >
          N/A
        </span>
        <span className="text-xs text-[color:var(--app-fg-muted)]">/ 100</span>
      </div>
      <p className="text-xs text-[color:var(--color-fg-muted)]">
        분석 자료가 부족해 점수를 산정하지 않았습니다.
      </p>
    </div>
  );
}
