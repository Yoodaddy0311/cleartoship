'use client';

// <DevPipelineBanner /> — surfaces the audit-worker enqueue mode so that any
// non-production wiring (direct-worker dev shortcut, or unconfigured "stub")
// is visible at a glance. Renders nothing for `cloud-tasks` and `null` so the
// banner stays out of the way in normal/unknown states.

import { AlertTriangle, Info } from 'lucide-react';
import { cn } from '@cleartoship/ui';
import type { EnqueueMode } from '@cleartoship/shared-types';

interface DevPipelineBannerProps {
  mode: EnqueueMode | null;
  className?: string;
}

export function DevPipelineBanner({ mode, className }: DevPipelineBannerProps) {
  // Production & unknown states stay hidden — the banner is purely a dev/ops
  // affordance, not a user-facing message.
  if (mode === 'cloud-tasks' || mode === null) {
    return null;
  }

  if (mode === 'direct-worker') {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
          'border-[color:var(--color-severity-p2)]',
          'bg-[rgba(245,158,11,0.08)]',
          'text-[color:var(--color-fg-primary)]',
          className
        )}
      >
        <Info
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--color-severity-p2)]"
        />
        <span>
          <span className="font-medium">개발 모드:</span>{' '}
          <span className="text-[color:var(--color-fg-secondary)]">
            워커 직접 호출 (Cloud Tasks 우회)
          </span>
        </span>
      </div>
    );
  }

  // mode === 'stub' — worker is not connected at all. This is a hard warning.
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
        'border-[color:var(--color-severity-p0)]',
        'bg-[rgba(255,59,105,0.08)]',
        'text-[color:var(--color-fg-primary)]',
        className
      )}
    >
      <AlertTriangle
        aria-hidden="true"
        className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--color-severity-p0)]"
      />
      <span>
        <span className="font-medium text-[color:var(--color-severity-p0)]">
          ⚠ 워커 미연결
        </span>{' '}
        <span className="text-[color:var(--color-fg-secondary)]">
          — Cloud Tasks/Worker URL 환경변수 미설정. Audit 실행 안 됨.
        </span>
      </span>
    </div>
  );
}
