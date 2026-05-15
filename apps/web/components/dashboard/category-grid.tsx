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

export function CategoryGrid({
  scores,
}: {
  scores: Record<AuditCategory, number>;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {ALL_CATEGORIES.map((c) => {
        const s = scores[c] ?? 0;
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
