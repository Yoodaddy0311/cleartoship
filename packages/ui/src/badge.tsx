import * as React from 'react';
import { cn } from './lib/cn';

export type Severity = 'P0' | 'P1' | 'P2' | 'P3';
export type StatusVariant =
  | 'complete'
  | 'partial'
  | 'ui_only'
  | 'logic_only'
  | 'missing_connection'
  | 'missing'
  | 'risky'
  | 'recommended'
  | 'unknown';

export type BadgeVariant = Severity | StatusVariant | 'neutral';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  icon?: React.ReactNode;
  /** Optional override label. Children take precedence. */
  label?: string;
}

function badgeStyle(varName: string): React.CSSProperties {
  return {
    color: `var(${varName})`,
    backgroundColor: `color-mix(in oklch, var(${varName}) 12%, transparent)`,
    border: `1px solid color-mix(in oklch, var(${varName}) 24%, transparent)`,
  };
}

const variantToVar: Record<BadgeVariant, string | null> = {
  P0: '--sev-p0',
  P1: '--sev-p1',
  P2: '--sev-p2',
  P3: '--sev-p3',
  complete: '--sev-p3',
  partial: '--sev-p2',
  ui_only: '--sev-p2',
  logic_only: '--sev-p2',
  missing_connection: '--sev-p1',
  missing: '--sev-p0',
  risky: '--sev-p1',
  recommended: '--sev-p3',
  unknown: null,
  neutral: null,
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  function Badge(
    { variant = 'neutral', icon, label, className, children, ...rest },
    ref
  ) {
    const cssVar = variantToVar[variant];
    const style: React.CSSProperties =
      cssVar !== null
        ? badgeStyle(cssVar)
        : {
            color: 'var(--app-fg-muted)',
            backgroundColor: 'var(--app-bg-soft)',
            border: '1px solid var(--app-border)',
          };

    return (
      <span
        ref={ref}
        style={style}
        className={cn(
          'inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium',
          'whitespace-nowrap select-none',
          className
        )}
        {...rest}
      >
        {icon ? (
          <span aria-hidden="true" className="inline-flex h-3 w-3 items-center">
            {icon}
          </span>
        ) : null}
        {children ?? label}
      </span>
    );
  }
);
