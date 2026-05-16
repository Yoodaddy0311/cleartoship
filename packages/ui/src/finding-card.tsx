import * as React from 'react';
import { cn } from './lib/cn';

export type FindingSeverity = 'P0' | 'P1' | 'P2' | 'P3';
export type FindingStatus = 'open' | 'confirmed' | 'dismissed';

export interface FindingCardProps {
  severity: FindingSeverity;
  title: string;
  ruleId: string;
  filePath: string;
  line: number;
  category: string;
  excerpt?: string;
  status?: FindingStatus;
  onView?: () => void;
  onConfirm?: () => void;
  onDismiss?: () => void;
  className?: string;
}

const severityVar: Record<FindingSeverity, string> = {
  P0: 'var(--sev-p0)',
  P1: 'var(--sev-p1)',
  P2: 'var(--sev-p2)',
  P3: 'var(--sev-p3)',
};

const severityLabel: Record<FindingSeverity, string> = {
  P0: 'P0 · Critical',
  P1: 'P1 · High',
  P2: 'P2 · Medium',
  P3: 'P3 · Low',
};

export function FindingCard({
  severity,
  title,
  ruleId,
  filePath,
  line,
  category,
  excerpt,
  status = 'open',
  onView,
  onConfirm,
  onDismiss,
  className,
}: FindingCardProps) {
  const sevColor = severityVar[severity];
  return (
    <article
      data-severity={severity}
      data-status={status}
      className={cn('relative overflow-hidden', className)}
      style={{
        background: 'var(--app-surface)',
        border: '1px solid var(--app-border)',
        borderRadius: 'var(--app-radius)',
        boxShadow: 'var(--app-shadow-card)',
        padding: '16px 20px 16px 24px',
      }}
    >
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 h-full w-1"
        style={{ background: sevColor }}
      />

      <header className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold uppercase tracking-wide"
          style={{
            color: sevColor,
            backgroundColor: `color-mix(in oklch, ${sevColor} 14%, transparent)`,
            border: `1px solid color-mix(in oklch, ${sevColor} 28%, transparent)`,
          }}
        >
          {severityLabel[severity]}
        </span>
        <h3
          className="text-[15px] font-semibold"
          style={{ color: 'var(--app-fg)' }}
        >
          {title}
        </h3>
        <span
          className="ml-auto inline-flex h-5 items-center rounded px-1.5 font-mono text-[11px]"
          style={{
            color: 'var(--app-fg-muted)',
            background: 'var(--app-chip-bg)',
          }}
        >
          {ruleId}
        </span>
      </header>

      <div
        className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
        style={{ color: 'var(--app-fg-muted)' }}
      >
        <span className="font-mono">
          {filePath}:{line}
        </span>
        <span aria-hidden="true">·</span>
        <span>{category}</span>
        {excerpt ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="truncate">{excerpt}</span>
          </>
        ) : null}
      </div>

      {(onView || onConfirm || onDismiss) && (
        <footer className="mt-3 flex flex-wrap items-center gap-2">
          {onView ? (
            <button
              type="button"
              onClick={onView}
              className="inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--mk-accent)]"
              style={{
                background: 'transparent',
                borderColor: 'var(--app-border)',
                color: 'var(--app-fg)',
              }}
            >
              View
            </button>
          ) : null}
          {onConfirm ? (
            <button
              type="button"
              onClick={onConfirm}
              className="inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--mk-accent)]"
              style={{
                background: 'var(--app-fg)',
                color: '#FFFFFF',
              }}
            >
              Confirm
            </button>
          ) : null}
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--mk-accent)]"
              style={{
                background: 'transparent',
                color: 'var(--app-fg-muted)',
              }}
            >
              Dismiss
            </button>
          ) : null}
        </footer>
      )}
    </article>
  );
}
