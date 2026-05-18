// L-P1-6 — Skeleton placeholder for the 3-sentence Narrative block.
//
// Three lines with decreasing width (full / ~4-5 / ~3-5) mirror the typical
// 3-sentence narrative shape so the transition to the real `<Narrative />`
// component avoids visible CLS.

import * as React from 'react';
import { Skeleton } from '@cleartoship/ui';
import { t, DEFAULT_LOCALE, type Locale } from '@/lib/i18n';

export interface NarrativeSkeletonProps {
  readonly className?: string;
  readonly locale?: Locale;
}

export function NarrativeSkeleton({
  className,
  locale,
}: NarrativeSkeletonProps): React.JSX.Element {
  const activeLocale: Locale = locale ?? DEFAULT_LOCALE;
  return (
    <div
      data-testid="narrative-skeleton"
      role="status"
      aria-busy="true"
      aria-label={t('skeleton.loading.aria', activeLocale)}
      className={[
        'flex flex-col gap-2 rounded-mk border border-app-border bg-mk-bg-soft p-5',
        className ?? '',
      ]
        .join(' ')
        .trim()}
    >
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
    </div>
  );
}
