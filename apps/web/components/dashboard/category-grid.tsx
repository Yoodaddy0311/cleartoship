import { ScoreGauge } from '@cleartoship/ui';
import {
  ALL_CATEGORIES,
  categoryLabel,
  type AuditCategory,
} from '@/lib/format/category';
import { LaunchStatusChip } from '@/components/common/launch-status-chip';
import type { LaunchStatus } from '@/lib/format/status';

function chipFor(score: number): LaunchStatus {
  if (score >= 80) return 'ready';
  if (score >= 60) return 'ready_with_improvements';
  if (score >= 40) return 'needs_work';
  return 'stop';
}

/**
 * `scores` accepts `number | null`. `null` = N/A (coverage signal could not
 * score this category). N/A tiles render inline — no score gauge, no verdict
 * chip — so a 0점 mis-render never happens. `number` (legacy callers) is
 * also supported.
 */
export function CategoryGrid({
  scores,
}: {
  scores: Record<AuditCategory, number | null>;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {ALL_CATEGORIES.map((c) => {
        const s = scores[c];
        if (s === null || s === undefined) {
          return <CategoryNATile key={c} label={categoryLabel(c)} />;
        }
        return (
          <ScoreGauge
            key={c}
            label={categoryLabel(c)}
            score={s}
            chip={<LaunchStatusChip status={chipFor(s)} />}
          />
        );
      })}
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
