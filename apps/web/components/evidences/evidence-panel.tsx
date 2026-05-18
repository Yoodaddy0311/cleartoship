'use client';

// EvidencePanel — collapsible wrapper around <EvidenceList> whose open/closed
// state persists to localStorage so a page reload doesn't re-collapse every
// finding the user already opened. Owns the truncated-banner that used to
// live inline in finding-detail-panel.tsx so the banner only shows when the
// section is actually expanded (no point announcing it while collapsed).

import { useId } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@cleartoship/ui';
import { EvidenceList } from '@/components/evidences/evidence-list';
import { usePersistentCollapse } from '@/lib/ui/use-persistent-collapse';
import { t } from '@/lib/i18n';
import type { FindingEvidenceView } from '@/lib/types/finding-view';

interface EvidencePanelProps {
  /**
   * Stable identifier for the localStorage key. The panel composes the full
   * key as `cts.evidence.collapsed.{ruleId}`. Use the semgrep rule_id when
   * available — otherwise the caller should fall back to a finding-scoped id
   * (e.g. `finding-${finding.id}`) so each finding still persists separately.
   */
  ruleId: string;
  items: FindingEvidenceView[];
  /**
   * Server-side flag — true when the evidences array was capped (see
   * EVIDENCE_CAP). Rendered inside the panel so the warning only appears
   * when the user has expanded the section.
   */
  truncated?: boolean;
  /** Initial collapse state before localStorage hydration. Default true. */
  defaultCollapsed?: boolean;
}

export function EvidencePanel({
  ruleId,
  items,
  truncated = false,
  defaultCollapsed = true,
}: EvidencePanelProps) {
  const storageKey = `cts.evidence.collapsed.${ruleId}`;
  const [collapsed, toggle] = usePersistentCollapse(storageKey, defaultCollapsed);
  // useId keeps aria-controls stable across renders without colliding when
  // multiple EvidencePanels share a page.
  const contentId = useId();

  const count = items.length;
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  // sr-only label tells assistive tech *which* section the trigger expands —
  // visible chevron + count is enough for sighted users.
  const srLabel = collapsed
    ? `${t('findings.detail.evidences')} 펼치기 (${count}건)`
    : `${t('findings.detail.evidences')} 접기 (${count}건)`;

  return (
    <div data-testid="evidence-panel" data-collapsed={collapsed ? 'true' : 'false'}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls={contentId}
        data-testid="evidence-panel-trigger"
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5',
          'text-sm font-medium text-[color:var(--color-fg-primary)]',
          'hover:bg-[rgba(255,255,255,0.04)]',
          'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
        )}
      >
        <Chevron aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span aria-hidden="true">
          {t('findings.detail.evidences')}{' '}
          <span
            data-testid="evidence-panel-count"
            className="ml-1 text-[color:var(--color-fg-secondary)]"
          >
            ({count}건)
          </span>
        </span>
        <span className="sr-only">{srLabel}</span>
      </button>

      <div
        id={contentId}
        role="region"
        aria-label={t('findings.detail.evidences')}
        hidden={collapsed}
        className={collapsed ? undefined : 'pt-3'}
      >
        {!collapsed ? (
          <>
            {truncated ? (
              <div
                role="status"
                aria-live="polite"
                data-testid="evidence-truncated-banner"
                className={cn(
                  'mb-3 flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
                  'border-[color:var(--color-severity-p2)]',
                  'bg-[rgba(245,158,11,0.08)]',
                  'text-[color:var(--color-fg-primary)]',
                )}
              >
                <AlertTriangle
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--color-severity-p2)]"
                />
                <span>
                  <span className="font-medium text-[color:var(--color-severity-p2)]">
                    알림:
                  </span>{' '}
                  <span className="text-[color:var(--color-fg-secondary)]">
                    {t('findings.detail.evidences.truncated')}
                  </span>
                </span>
              </div>
            ) : null}
            <EvidenceList items={items} />
          </>
        ) : null}
      </div>
    </div>
  );
}
