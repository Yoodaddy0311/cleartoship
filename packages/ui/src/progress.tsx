import * as React from 'react';
import { cn } from './lib/cn';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0-100 */
  value: number;
  indeterminate?: boolean;
  /** Caption rendered above the bar. */
  label?: string;
  /** Show the numeric percentage at the right. */
  showValue?: boolean;
}

/**
 * Linear progress — flat track + filled bar.
 * a11y: role="progressbar" with aria-valuenow.
 */
export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  function Progress(
    { className, value, indeterminate, label, showValue, ...rest },
    ref
  ) {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    return (
      <div ref={ref} className={cn('flex flex-col gap-1.5', className)} {...rest}>
        {(label || showValue) && (
          <div className="flex items-center justify-between text-xs">
            {label ? (
              <span className="text-[color:var(--app-fg-muted)]">{label}</span>
            ) : (
              <span />
            )}
            {showValue && !indeterminate ? (
              <span className="font-mono tabular-nums text-[color:var(--app-fg-muted)]">
                {clamped}%
              </span>
            ) : null}
          </div>
        )}
        <div
          role="progressbar"
          aria-valuenow={indeterminate ? undefined : clamped}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-busy={indeterminate || undefined}
          className="relative h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--app-border)]"
        >
          {indeterminate ? (
            <div
              className="absolute inset-y-0 left-0 w-1/3 animate-[shimmer-sweep_1500ms_linear_infinite] bg-[color:var(--app-fg)]"
            />
          ) : (
            <div
              className="h-full rounded-full bg-[color:var(--app-fg)] transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-standard)]"
              style={{ width: `${clamped}%` }}
            />
          )}
        </div>
      </div>
    );
  }
);
