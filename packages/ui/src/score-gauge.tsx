import * as React from 'react';
import { cn } from './lib/cn';

export interface ScoreGaugeProps {
  /** 0-100 */
  score: number;
  label: string;
  /** Optional chip text rendered right of the score (e.g., "보완 필요"). */
  chip?: React.ReactNode;
  /** Optional weight (relative importance). Renders subtly. */
  weight?: number;
  className?: string;
}

function bandColor(score: number): string {
  if (score >= 70) return 'var(--sev-p3)';
  if (score >= 55) return 'var(--sev-p2)';
  if (score >= 40) return 'var(--sev-p1)';
  return 'var(--sev-p0)';
}

/**
 * Horizontal stacked bar score gauge — see design-system §8.10.
 * Used in dashboard category grid.
 */
export function ScoreGauge({
  score,
  label,
  chip,
  weight,
  className,
}: ScoreGaugeProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const color = bandColor(clamped);

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-[10px] border border-[color:var(--app-border)]',
        'bg-[color:var(--app-surface)] p-4',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-[color:var(--app-fg-muted)]">
          {label}
        </span>
        {chip ? <span className="text-xs">{chip}</span> : null}
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className="font-mono tabular-nums text-[color:var(--app-fg)]"
          style={{ fontSize: '1.5rem', fontWeight: 600 }}
        >
          {clamped}
        </span>
        <span className="text-xs text-[color:var(--app-fg-muted)]">/ 100</span>
        {typeof weight === 'number' ? (
          <span className="ml-auto text-xs text-[color:var(--app-fg-muted)]">
            가중치 {weight}
          </span>
        ) : null}
      </div>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} 점수 ${clamped}`}
        className="h-1 w-full overflow-hidden rounded-full bg-[color:var(--app-border)]"
      >
        <div
          className="h-full rounded-full transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-standard)]"
          style={{ width: `${clamped}%`, background: color }}
        />
      </div>
    </div>
  );
}
