// L-P1-3 — Narrative (3-sentence "현황 요약") component.
//
// Pure render — no client-only hooks — so the file does NOT need 'use client'.
// Wraps audit-core `renderNarrative` and surfaces the result inside a live
// region so screen readers announce updates when the FCS prop changes (e.g.
// after a re-audit completes and the dashboard re-hydrates with fresh data).
//
// Heading is i18n-driven (`narrative.heading` — added in this batch); body is
// composed dynamically by audit-core so it stays in lockstep with the FCS
// engine without going through the i18n template path.

import type { FCSResult } from '@cleartoship/shared-types';
import { renderNarrative } from '@cleartoship/audit-core';
import { t, DEFAULT_LOCALE, type Locale } from '@/lib/i18n';

export interface NarrativeProps {
  readonly fcs: FCSResult;
  /**
   * Display locale. Defaults to the project default (`ko`) — server components
   * that already resolved the locale via cookie should thread it through;
   * static call sites can omit.
   */
  readonly locale?: Locale;
}

export function Narrative({ fcs, locale }: NarrativeProps) {
  const activeLocale: Locale = locale ?? DEFAULT_LOCALE;
  const body = renderNarrative({ fcs, locale: activeLocale });
  const heading = t('narrative.heading', activeLocale);

  return (
    <section
      aria-labelledby="narrative-heading"
      data-testid="narrative-section"
      className="flex flex-col gap-2 rounded-mk border border-app-border bg-mk-bg-soft p-5"
    >
      <h3
        id="narrative-heading"
        data-testid="narrative-heading"
        className="text-sm font-medium text-[color:var(--color-fg-secondary)]"
      >
        {heading}
      </h3>
      <p
        role="status"
        aria-live="polite"
        data-testid="narrative-body"
        data-locale={activeLocale}
        className="text-sm leading-[1.55] text-[color:var(--color-fg-secondary)]"
      >
        {body}
      </p>
    </section>
  );
}
