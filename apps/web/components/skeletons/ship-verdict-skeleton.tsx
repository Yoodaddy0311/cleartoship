// L-P1-6 — Skeleton placeholder for the ship-verdict / launch-status banner.
//
// Used as `<Suspense fallback={<ShipVerdictSkeleton />}>` while the verdict
// data resolves (FCS status chip + sub-text). The shape mirrors the live
// banner — a tall status pill on the left, two short sub-text lines on the
// right — so first-paint→ready transition has minimal CLS.
//
// a11y: the wrapper carries `role="status"` + `aria-busy="true"` + an i18n
// aria-label so screen readers announce "loading" once. The inner Skeleton
// primitives stay `aria-hidden` (handled by the primitive itself).

import * as React from 'react';
import { Skeleton } from '@cleartoship/ui';
import { t, DEFAULT_LOCALE, type Locale } from '@/lib/i18n';

export interface ShipVerdictSkeletonProps {
  readonly className?: string;
  readonly locale?: Locale;
}

export function ShipVerdictSkeleton({
  className,
  locale,
}: ShipVerdictSkeletonProps): React.JSX.Element {
  const activeLocale: Locale = locale ?? DEFAULT_LOCALE;
  return (
    <div
      data-testid="ship-verdict-skeleton"
      role="status"
      aria-busy="true"
      aria-label={t('skeleton.loading.aria', activeLocale)}
      className={[
        'flex items-center gap-4 rounded-mk border border-app-border bg-mk-bg-soft p-5',
        className ?? '',
      ]
        .join(' ')
        .trim()}
    >
      {/* Status pill placeholder — tall + wide enough to mirror the live chip */}
      <Skeleton className="h-24 w-full max-w-[360px]" rounded="lg" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-4 w-2/5" />
      </div>
    </div>
  );
}
