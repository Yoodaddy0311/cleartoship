'use client';

import { ALL_STATUSES, statusLabel, statusVar, type ImplementationStatus } from '@/lib/format/status';
import { cn } from '@cleartoship/ui';
import { t } from '@/lib/i18n';

export function StatusLegend({
  active,
  onToggle,
}: {
  active?: Set<ImplementationStatus>;
  onToggle?: (s: ImplementationStatus) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs uppercase tracking-wide text-[color:var(--color-fg-muted)]">
        {t('graph.legend.title')}
      </span>
      <ul className="flex flex-wrap gap-1.5">
        {ALL_STATUSES.map((s) => {
          const color = statusVar(s);
          const isActive = active ? active.has(s) : true;
          const isToggle = typeof onToggle === 'function';
          return (
            <li key={s}>
              {isToggle ? (
                <button
                  type="button"
                  onClick={() => onToggle?.(s)}
                  aria-pressed={isActive}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs',
                    'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                    isActive
                      ? 'border-[color:var(--color-border-emphasis)] bg-[rgba(255,255,255,0.04)]'
                      : 'border-[color:var(--color-border-subtle)] opacity-60'
                  )}
                  style={{ color }}
                >
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: color }}
                  />
                  {statusLabel(s)}
                </button>
              ) : (
                <span
                  className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[color:var(--color-border-subtle)] px-2.5 text-xs"
                  style={{ color }}
                >
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: color }}
                  />
                  {statusLabel(s)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
