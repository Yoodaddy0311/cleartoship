'use client';

import { SEVERITY_ORDER, type Severity } from '@/lib/format/severity';
import { ALL_CATEGORIES, categoryLabel, type AuditCategory } from '@/lib/format/category';
import { t } from '@/lib/i18n';
import { cn } from '@cleartoship/ui';
import type { FindingConfidence } from '@/lib/types/finding-view';

/**
 * W2.C7.1 — 4 filter dimensions:
 *  - severities (P0..P3) multi-select
 *  - categories (AuditCategory) multi-select
 *  - confidences (high|medium|low) multi-select
 *  - falsePositive 3-way (all | show | hide)
 *
 * `falsePositive` semantics:
 *  - 'all'  → no filtering on the FP flag (default)
 *  - 'show' → only rows the user has flagged as false-positive
 *  - 'hide' → exclude flagged rows (typical "clean up" mode)
 *
 * Filter UI stays presentational: URL serialization lives in
 * FindingsTable / findings page so this component can be reused in places
 * where deep-linking is not desired.
 */

export const ALL_CONFIDENCES: FindingConfidence[] = ['high', 'medium', 'low'];

export type FalsePositiveMode = 'all' | 'show' | 'hide';
export const FALSE_POSITIVE_MODES: FalsePositiveMode[] = ['all', 'show', 'hide'];

export interface FindingFiltersValue {
  severities: Set<Severity>;
  categories: Set<AuditCategory>;
  confidences: Set<FindingConfidence>;
  falsePositive: FalsePositiveMode;
}

export function createEmptyFilters(): FindingFiltersValue {
  return {
    severities: new Set<Severity>(),
    categories: new Set<AuditCategory>(),
    confidences: new Set<FindingConfidence>(),
    falsePositive: 'all',
  };
}

const CHIP_BASE =
  'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]';
const CHIP_ACTIVE =
  'border-[color:var(--mk-accent-2)] bg-[color-mix(in_oklch,var(--mk-accent-2)_15%,transparent)] text-[color:var(--app-fg)]';
const CHIP_IDLE =
  'border-[color:var(--color-border-default)] text-[color:var(--color-fg-secondary)] hover:border-[color:var(--color-border-emphasis)]';

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
  function toggleConfidence(c: FindingConfidence) {
    const next = new Set(value.confidences);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    onChange({ ...value, confidences: next });
  }
  function setFalsePositive(mode: FalsePositiveMode) {
    onChange({ ...value, falsePositive: mode });
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
                className={cn(CHIP_BASE, active ? CHIP_ACTIVE : CHIP_IDLE)}
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
                className={cn(CHIP_BASE, active ? CHIP_ACTIVE : CHIP_IDLE)}
              >
                {categoryLabel(c)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm text-[color:var(--color-fg-secondary)]">
          {t('findings.filter.confidence')}
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {ALL_CONFIDENCES.map((c) => {
            const active = value.confidences.has(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleConfidence(c)}
                aria-pressed={active}
                className={cn(CHIP_BASE, active ? CHIP_ACTIVE : CHIP_IDLE)}
              >
                {t(`findings.filter.confidence.${c}` as never)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm text-[color:var(--color-fg-secondary)]">
          {t('findings.filter.falsePositive')}
        </legend>
        <div
          role="radiogroup"
          aria-label={t('findings.filter.falsePositive')}
          className="flex flex-wrap gap-1.5"
        >
          {FALSE_POSITIVE_MODES.map((mode) => {
            const active = value.falsePositive === mode;
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setFalsePositive(mode)}
                className={cn(CHIP_BASE, active ? CHIP_ACTIVE : CHIP_IDLE)}
              >
                {t(`findings.filter.falsePositive.${mode}` as never)}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

// ---------------------------------------------------------------------------
// URL <-> filter serialization. Lives next to the component so callers that
// need deep-linking can opt-in without re-implementing the parse logic.
//
// Schema (CSV style — keeps URLs short + obvious):
//   ?sev=P0,P1
//   ?cat=PRODUCT_INTENT,SECURITY_PRIVACY
//   ?conf=HIGH,MEDIUM        (uppercased for URL aesthetics; lowercased internally)
//   ?fp=show|hide|all        (default 'all' is omitted)
// ---------------------------------------------------------------------------

const VALID_SEVERITIES: ReadonlyArray<Severity> = SEVERITY_ORDER;
const VALID_CATEGORIES: ReadonlyArray<AuditCategory> = ALL_CATEGORIES;
const VALID_CONFIDENCES: ReadonlyArray<FindingConfidence> = ALL_CONFIDENCES;

export function parseFiltersFromSearchParams(
  params: URLSearchParams | { get(name: string): string | null },
): FindingFiltersValue {
  const out = createEmptyFilters();
  const sev = params.get('sev');
  if (sev) {
    for (const raw of sev.split(',').map((s) => s.trim()).filter(Boolean)) {
      if ((VALID_SEVERITIES as ReadonlyArray<string>).includes(raw)) {
        out.severities.add(raw as Severity);
      }
    }
  }
  const cat = params.get('cat');
  if (cat) {
    for (const raw of cat.split(',').map((s) => s.trim()).filter(Boolean)) {
      if ((VALID_CATEGORIES as ReadonlyArray<string>).includes(raw)) {
        out.categories.add(raw as AuditCategory);
      }
    }
  }
  const conf = params.get('conf');
  if (conf) {
    for (const raw of conf.split(',').map((s) => s.trim()).filter(Boolean)) {
      const lower = raw.toLowerCase();
      if ((VALID_CONFIDENCES as ReadonlyArray<string>).includes(lower)) {
        out.confidences.add(lower as FindingConfidence);
      }
    }
  }
  const fp = params.get('fp');
  if (fp === 'show' || fp === 'hide' || fp === 'all') {
    out.falsePositive = fp;
  }
  return out;
}

export function serializeFiltersToSearchParams(
  filters: FindingFiltersValue,
  base?: URLSearchParams,
): URLSearchParams {
  // Clone so we never mutate the caller's instance.
  const params = new URLSearchParams(base ? base.toString() : '');
  // Always remove our own keys before re-applying — preserves any unrelated
  // params the caller wants to keep (e.g., feature flags).
  params.delete('sev');
  params.delete('cat');
  params.delete('conf');
  params.delete('fp');

  if (filters.severities.size > 0) {
    const sorted = VALID_SEVERITIES.filter((s) => filters.severities.has(s));
    params.set('sev', sorted.join(','));
  }
  if (filters.categories.size > 0) {
    const sorted = VALID_CATEGORIES.filter((c) => filters.categories.has(c));
    params.set('cat', sorted.join(','));
  }
  if (filters.confidences.size > 0) {
    const sorted = VALID_CONFIDENCES.filter((c) => filters.confidences.has(c));
    params.set('conf', sorted.map((c) => c.toUpperCase()).join(','));
  }
  if (filters.falsePositive !== 'all') {
    params.set('fp', filters.falsePositive);
  }
  return params;
}
