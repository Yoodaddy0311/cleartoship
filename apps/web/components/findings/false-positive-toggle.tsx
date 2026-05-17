'use client';

// "오탐 표시" toggle button — sits at the top of FindingDetailPanel.
//
// Controlled component: the parent owns the `useFalsePositive` hook and
// passes the current state + toggle handler down. This avoids two Firestore
// reads from a single panel render (one in the toggle, one in the panel for
// strikethrough styling).
//
// a11y: aria-pressed reflects current state, aria-label carries the Korean
// label so screen readers always announce it even on viewports where the
// visual text label is hidden.

import { t } from '@/lib/i18n';
import { cn } from '@cleartoship/ui';

interface FalsePositiveToggleProps {
  isFalsePositive: boolean;
  loading: boolean;
  saving: boolean;
  error: Error | null;
  onToggle: () => void;
}

export function FalsePositiveToggle({
  isFalsePositive,
  loading,
  saving,
  error,
  onToggle,
}: FalsePositiveToggleProps) {
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-pressed={isFalsePositive}
        aria-label={t('findings.detail.falsePositive.toggle')}
        disabled={loading || saving}
        onClick={onToggle}
        data-testid="false-positive-toggle"
        className={cn(
          'inline-flex items-center gap-1.5 self-start rounded-md border px-3 py-1.5 text-sm transition-colors',
          'border-[color:var(--color-border-subtle)]',
          'text-[color:var(--color-fg-secondary)]',
          'hover:bg-[rgba(255,255,255,0.04)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
          isFalsePositive &&
            'border-[color:var(--color-severity-p2)] bg-[rgba(245,158,11,0.08)] text-[color:var(--color-severity-p2)]',
        )}
      >
        <span aria-hidden="true">{isFalsePositive ? '✓' : '⚑'}</span>
        <span>
          {isFalsePositive
            ? t('findings.detail.falsePositive.marked')
            : t('findings.detail.falsePositive.unmarked')}
        </span>
      </button>
      {error ? (
        <p
          role="alert"
          className="text-xs text-[color:var(--color-severity-p1)]"
          data-testid="false-positive-error"
        >
          {t('findings.detail.falsePositive.error')}
        </p>
      ) : null}
    </div>
  );
}
