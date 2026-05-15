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

/**
 * Returns inline style with bg = color@12%, text = color.
 * We use color-mix to avoid hex-with-alpha string surgery; falls back to rgba.
 */
function badgeStyle(varName: string): React.CSSProperties {
  return {
    color: `var(${varName})`,
    backgroundColor: `color-mix(in oklch, var(${varName}) 12%, transparent)`,
    border: `1px solid color-mix(in oklch, var(${varName}) 24%, transparent)`,
  };
}

const variantToVar: Record<BadgeVariant, string | null> = {
  P0: '--color-severity-p0',
  P1: '--color-severity-p1',
  P2: '--color-severity-p2',
  P3: '--color-severity-p3',
  complete: '--color-status-complete',
  partial: '--color-status-partial',
  ui_only: '--color-status-ui-only',
  logic_only: '--color-status-logic-only',
  missing_connection: '--color-status-missing-connection',
  missing: '--color-status-missing',
  risky: '--color-status-risky',
  recommended: '--color-status-recommended',
  unknown: '--color-status-unknown',
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
            color: 'var(--color-fg-secondary)',
            backgroundColor: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--color-border-default)',
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
