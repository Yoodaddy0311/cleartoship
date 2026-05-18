// L-P1-6 — Skeleton placeholder for the score gauge (FCS / ScoreOverview).
//
// Mirrors a circular gauge (w-32 h-32) + a short label line below so the
// transition into the real `<FounderConfidenceScore />` or `<ScoreOverview />`
// doesn't shift layout.

import * as React from 'react';
import { Skeleton } from '@cleartoship/ui';
import { t, DEFAULT_LOCALE, type Locale } from '@/lib/i18n';

export interface ScoreSkeletonProps {
  readonly className?: string;
  readonly locale?: Locale;
}

export function ScoreSkeleton({
  className,
  locale,
}: ScoreSkeletonProps): React.JSX.Element {
  const activeLocale: Locale = locale ?? DEFAULT_LOCALE;
  return (
    <div
      data-testid="score-skeleton"
      role="status"
      aria-busy="true"
      aria-label={t('skeleton.loading.aria', activeLocale)}
      className={[
        'flex flex-col items-center gap-3 rounded-mk border border-app-border bg-mk-bg-soft p-5',
        className ?? '',
      ]
        .join(' ')
        .trim()}
    >
      {/* Circular gauge placeholder */}
      <Skeleton className="h-32 w-32" rounded="full" />
      {/* Single label line under the gauge */}
      <Skeleton className="h-4 w-24" />
    </div>
  );
}
