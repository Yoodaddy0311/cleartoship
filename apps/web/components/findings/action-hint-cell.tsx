import { ExternalLink } from 'lucide-react';
import { cn } from '@cleartoship/ui';
import { etaLabel } from '@/lib/format/action-hint';
import { t } from '@/lib/i18n';
import type { ActionHintView } from '@/lib/types/finding-view';

/**
 * "다음 행동" cell — renders the L-P0-6 action hint as a single-line text +
 * ETA badge. Used both inside the findings table (compact `variant="row"`) and
 * inside the detail panel (card-sized `variant="panel"`). When the hint is
 * missing (Appendix D dictionary not yet attached for that ruleFamily), shows
 * an unobtrusive placeholder so the column never collapses.
 */
export function ActionHintCell({
  hint,
  variant = 'row',
}: {
  hint?: ActionHintView;
  variant?: 'row' | 'panel';
}) {
  if (!hint) {
    return (
      <span
        data-testid="action-hint-empty"
        className="text-xs text-[color:var(--color-fg-muted)]"
      >
        {t('findings.actionHint.empty')}
      </span>
    );
  }
  const eta = etaLabel(hint.etaMinutes);
  return (
    <div
      data-testid="action-hint"
      data-eta-minutes={hint.etaMinutes}
      className={cn(
        'flex flex-col gap-1 ko-text',
        variant === 'panel' ? 'text-sm' : 'text-xs',
      )}
    >
      <span className="text-[color:var(--color-fg-primary)] leading-snug">
        {hint.text}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          data-testid="action-hint-eta"
          aria-label={`${t('findings.actionHint.etaPrefix')} ${eta}`}
          className={cn(
            'inline-flex w-fit items-center rounded-md px-1.5 py-0.5 font-mono text-[11px]',
            'bg-[rgba(255,255,255,0.04)] text-[color:var(--color-fg-secondary)]',
          )}
        >
          {eta}
        </span>
        {hint.referenceUrl ? (
          <a
            data-testid="action-hint-reference"
            href={hint.referenceUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('findings.actionHint.referenceAria')}
            className={cn(
              'inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[11px]',
              'text-[color:var(--color-fg-secondary)] hover:text-[color:var(--color-fg-primary)]',
              'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
            )}
          >
            <ExternalLink
              aria-hidden="true"
              className={variant === 'panel' ? 'h-3.5 w-3.5' : 'h-3 w-3'}
            />
            <span className="underline-offset-2 hover:underline">
              {t('findings.actionHint.referenceLabel')}
            </span>
          </a>
        ) : null}
      </div>
    </div>
  );
}
