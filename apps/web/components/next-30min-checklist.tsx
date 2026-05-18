'use client';

// W2.C5.1 — Next30MinChecklist
//
// Up-to-3 quick wins the founder can clear in 30 minutes or less. The widget
// stays deliberately dumb: callers pass the full candidate set and ETA in
// minutes (sourced from the action-hint ladder); this component does ONLY the
// filter+sort+cap+persist concerns:
//   1. Drop items with `etaMinutes > 30` (long fixes belong in the main feed).
//   2. Sort by severity desc (P0 first) so the founder always sees the most
//      consequential 30-minute fix at the top of the card.
//   3. Cap to 3 — discoverability budget for a sidebar widget.
//   4. Checked state survives a reload via `usePersistentChecklist`.
//
// Native `<input type="checkbox">` is used (no Checkbox component shipped from
// `@cleartoship/ui` at the time of writing). Tailwind handles the visual
// state; the underlying input is the source of truth for screen readers.

import { tf, t } from '@/lib/i18n';
import { severityToken, type Severity } from '@/lib/format/severity';
import { usePersistentChecklist } from '@/lib/ui/use-persistent-checklist';

export interface ChecklistItem {
  readonly id: string;
  readonly title: string;
  readonly etaMinutes: number;
  readonly href?: string;
  readonly severity?: Severity;
}

export interface Next30MinChecklistProps {
  readonly storageKey: string;
  readonly items: readonly ChecklistItem[];
  /** Override for the i18n default empty-state copy. */
  readonly emptyText?: string;
}

const MAX_ITEMS = 3;
const ETA_CEILING_MINUTES = 30;

// Lower index = higher priority. Items without a severity sort to the end —
// the founder still sees them, just below the prioritized P0/P1 fixes.
const SEVERITY_RANK: Record<Severity, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

function rankOf(s: Severity | undefined): number {
  return s ? SEVERITY_RANK[s] : Number.POSITIVE_INFINITY;
}

function selectQuickWins(items: readonly ChecklistItem[]): ChecklistItem[] {
  const filtered = items.filter(
    (i) => Number.isFinite(i.etaMinutes) && i.etaMinutes <= ETA_CEILING_MINUTES,
  );
  // Stable sort: severity desc; ties keep the caller's order so the parent
  // can tiebreak by confidence/impact upstream without us second-guessing.
  const sorted = filtered
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const r = rankOf(a.item.severity) - rankOf(b.item.severity);
      return r !== 0 ? r : a.idx - b.idx;
    })
    .map(({ item }) => item);
  return sorted.slice(0, MAX_ITEMS);
}

export function Next30MinChecklist({
  storageKey,
  items,
  emptyText,
}: Next30MinChecklistProps) {
  const [checked, setItem] = usePersistentChecklist(storageKey);
  const visible = selectQuickWins(items);
  const heading = t('next30Min.heading');

  return (
    <section
      aria-labelledby="next30min-heading"
      data-testid="next-30min-checklist"
      className="flex flex-col gap-3 rounded-mk border border-app-border bg-mk-bg-soft p-5"
    >
      <h2
        id="next30min-heading"
        className="text-sm font-semibold text-[color:var(--color-fg)]"
      >
        {heading}
      </h2>

      {visible.length === 0 ? (
        <p
          role="status"
          data-testid="next-30min-empty"
          className="text-sm text-[color:var(--color-fg-muted)]"
        >
          {emptyText ?? t('next30Min.empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2" role="list">
          {visible.map((item) => {
            const isChecked = checked[item.id] === true;
            const sev = item.severity;
            const accent = sev ? severityToken(sev) : 'var(--color-fg-muted)';
            return (
              <li
                key={item.id}
                data-testid={`next-30min-item-${item.id}`}
                data-checked={isChecked ? 'true' : 'false'}
                className="flex items-start gap-3 rounded-md border border-app-border bg-mk-bg p-3"
              >
                <input
                  type="checkbox"
                  id={`next-30min-checkbox-${item.id}`}
                  checked={isChecked}
                  onChange={(e) => setItem(item.id, e.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-app-border"
                  style={{ accentColor: accent }}
                  aria-label={item.title}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <label
                    htmlFor={`next-30min-checkbox-${item.id}`}
                    className={`cursor-pointer text-sm leading-snug ${
                      isChecked
                        ? 'line-through opacity-50'
                        : 'text-[color:var(--color-fg)]'
                    }`}
                  >
                    {item.href ? (
                      <a
                        href={item.href}
                        className="hover:underline focus-visible:underline"
                      >
                        {item.title}
                      </a>
                    ) : (
                      item.title
                    )}
                  </label>
                  <span
                    data-testid={`next-30min-eta-${item.id}`}
                    className="inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{
                      color: accent,
                      background: `color-mix(in oklch, ${accent} 12%, transparent)`,
                      border: `1px solid color-mix(in oklch, ${accent} 28%, transparent)`,
                    }}
                  >
                    {tf('next30Min.eta.minutes', { n: item.etaMinutes })}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
