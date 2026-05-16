'use client';

import { SEVERITY_ORDER, type Severity } from '@/lib/format/severity';
import { ALL_CATEGORIES, categoryLabel, type AuditCategory } from '@/lib/format/category';
import { t } from '@/lib/i18n';
import { cn } from '@cleartoship/ui';

export interface FindingFiltersValue {
  severities: Set<Severity>;
  categories: Set<AuditCategory>;
}

export function FindingFilters({
  value,
  onChange,
}: {
  value: FindingFiltersValue;
  onChange: (v: FindingFiltersValue) => void;
}) {
  function toggleSeverity(s: Severity) {
    const next = new Set(value.severities);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    onChange({ ...value, severities: next });
  }
  function toggleCategory(c: AuditCategory) {
    const next = new Set(value.categories);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    onChange({ ...value, categories: next });
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset>
        <legend className="mb-2 text-sm text-[color:var(--color-fg-secondary)]">
          {t('findings.filter.severity')}
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {SEVERITY_ORDER.map((s) => {
            const active = value.severities.has(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleSeverity(s)}
                aria-pressed={active}
                className={cn(
                  'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs',
                  'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                  active
                    ? 'border-[color:var(--mk-accent-2)] bg-[color-mix(in_oklch,var(--mk-accent-2)_15%,transparent)] text-[color:var(--app-fg)]'
                    : 'border-[color:var(--color-border-default)] text-[color:var(--color-fg-secondary)] hover:border-[color:var(--color-border-emphasis)]'
                )}
              >
                <span className="font-mono">{s}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm text-[color:var(--color-fg-secondary)]">
          {t('findings.filter.category')}
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {ALL_CATEGORIES.map((c) => {
            const active = value.categories.has(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleCategory(c)}
                aria-pressed={active}
                className={cn(
                  'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs',
                  'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                  active
                    ? 'border-[color:var(--mk-accent-2)] bg-[color-mix(in_oklch,var(--mk-accent-2)_15%,transparent)] text-[color:var(--app-fg)]'
                    : 'border-[color:var(--color-border-default)] text-[color:var(--color-fg-secondary)] hover:border-[color:var(--color-border-emphasis)]'
                )}
              >
                {categoryLabel(c)}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
