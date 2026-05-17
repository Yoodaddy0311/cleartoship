'use client';

import * as React from 'react';
import { Check, Loader2, Circle } from 'lucide-react';
import { cn } from '@cleartoship/ui';
import {
  AUDIT_STEPS,
  type AuditStep,
} from '@cleartoship/shared-types';
import { AUDIT_STEP_LABELS } from '@/lib/i18n/ko';

export type { AuditStep };
export { AUDIT_STEPS };

export interface ProgressTimelineProps {
  /** Current step key (or null when finished / not started). */
  currentStep: AuditStep | null;
  /** Status of the run. */
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
}

function stepState(
  step: AuditStep,
  currentStep: AuditStep | null,
  status: ProgressTimelineProps['status']
): 'done' | 'current' | 'pending' {
  if (status === 'COMPLETED') return 'done';
  if (!currentStep) return 'pending';
  const idx = AUDIT_STEPS.indexOf(step);
  const cur = AUDIT_STEPS.indexOf(currentStep);
  if (idx < cur) return 'done';
  if (idx === cur) return 'current';
  return 'pending';
}

export function ProgressTimeline({
  currentStep,
  status,
}: ProgressTimelineProps) {
  return (
    <ol
      aria-label="감사 단계 진행"
      className="flex flex-col gap-0.5"
    >
      {AUDIT_STEPS.map((step, i) => {
        const state = stepState(step, currentStep, status);
        const label = AUDIT_STEP_LABELS[step] ?? step;
        return (
          <li
            key={step}
            className={cn(
              'relative flex items-center gap-3 rounded-md px-2 py-2 transition-colors',
              state === 'current' &&
                'bg-[color-mix(in_oklch,var(--mk-accent-2)_8%,transparent)]'
            )}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span
              aria-hidden="true"
              className={cn(
                'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                'border text-xs font-mono tabular-nums',
                state === 'done' &&
                  'border-[color:var(--color-severity-p3)] text-[color:var(--color-severity-p3)] bg-[color-mix(in_oklch,var(--color-severity-p3)_12%,transparent)]',
                state === 'current' &&
                  'border-[color:var(--mk-accent-2)] text-[color:var(--mk-accent-2)] bg-[color-mix(in_oklch,var(--mk-accent-2)_15%,transparent)] animate-pulse',
                state === 'pending' &&
                  'border-[color:var(--color-border-default)] text-[color:var(--color-fg-muted)]'
              )}
            >
              {state === 'done' ? (
                <Check className="h-3.5 w-3.5" />
              ) : state === 'current' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <span>{String(i + 1).padStart(2, '0')}</span>
              )}
            </span>
            <span
              className={cn(
                'ko-text min-w-0 flex-1 text-sm',
                state === 'done' && 'text-[color:var(--color-fg-secondary)]',
                state === 'current' && 'text-[color:var(--color-fg-primary)] font-medium',
                state === 'pending' && 'text-[color:var(--color-fg-muted)]'
              )}
            >
              {label}
            </span>
            {state === 'pending' ? (
              <Circle
                aria-hidden="true"
                className="ml-auto h-3 w-3 text-[color:var(--color-fg-disabled)]"
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
