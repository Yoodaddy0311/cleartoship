'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card, CardBody, Button } from '@cleartoship/ui';
import { SeverityChip } from '@/components/common/severity-chip';
import { ConfidenceChip } from '@/components/common/confidence-chip';
import { categoryLabel, ALL_CATEGORIES, type AuditCategory } from '@/lib/format/category';
import { SEVERITY_ORDER, type Severity } from '@/lib/format/severity';
import {
  FindingFilters,
  type FindingFiltersValue,
  createEmptyFilters,
  parseFiltersFromSearchParams,
  serializeFiltersToSearchParams,
} from './finding-filters';
import { ActionHintCell } from './action-hint-cell';
import type { FindingConfidence, FindingViewModel } from '@/lib/types/finding-view';
import { t } from '@/lib/i18n';

// W2.C7.1: sortable columns + URL sync.
//
// Sortable columns: severity, confidence, category. Header clicks cycle
//   none → desc → asc → none
// because the most useful default is "most severe / most confident first".
// `aria-sort` reflects the current state on each `<th>` so screen readers
// announce the order change.
//
// URL schema: `?sort=severity:desc` (single sort key). Default sort
// (severity desc, confidence desc, category asc as tie-breakers) is applied
// when no `?sort=` param is present, matching the legacy "P0 first" UX.

export type SortColumn = 'severity' | 'confidence' | 'category';
export type SortDirection = 'asc' | 'desc';
export interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

const SORTABLE_COLUMNS: ReadonlyArray<SortColumn> = ['severity', 'confidence', 'category'];

// Rank conventions (chosen so `direction: 'desc'` matches the colloquial
// expectation per column):
//
//   severity:   P0 > P1 > P2 > P3       → P0 = highest rank (3), P3 = lowest (0)
//   confidence: high > medium > low     → high = highest rank (2), low = lowest (0)
//   category:   alphabetical-ish (canonical ALL_CATEGORIES order) — desc on a
//               nominal axis isn't meaningful, but we still flip the sign so
//               the cycle behaves consistently across columns.
//
// With these ranks, "desc by severity" prints P0 → P3, which is the default
// the PRD asks for.
const CONFIDENCE_RANK: Record<FindingConfidence, number> = {
  high: 2,
  medium: 1,
  low: 0,
};

const CATEGORY_RANK: ReadonlyMap<AuditCategory, number> = new Map(
  // Negate the index so a small string-y category ('PRODUCT_INTENT' = idx 0)
  // sorts BEFORE later entries when direction === 'asc' (matching alphabetic
  // expectation). With the +sign convention used in compareBy, larger rank =
  // earlier in descending sort, so we invert.
  ALL_CATEGORIES.map((c, i) => [c, ALL_CATEGORIES.length - 1 - i] as const),
);

function severityRank(s: Severity): number {
  // SEVERITY_ORDER is ['P0','P1','P2','P3']; we want P0 to have the HIGHEST
  // rank so 'desc' = "P0 first".
  const ix = SEVERITY_ORDER.indexOf(s);
  if (ix === -1) return -1;
  return SEVERITY_ORDER.length - 1 - ix;
}

function categoryRank(c: AuditCategory): number {
  return CATEGORY_RANK.get(c) ?? -1;
}

function confidenceRank(c: FindingConfidence): number {
  return CONFIDENCE_RANK[c] ?? -1;
}

export function parseSortFromSearchParams(
  params: URLSearchParams | { get(name: string): string | null },
): SortState | null {
  const raw = params.get('sort');
  if (!raw) return null;
  const [col, dir] = raw.split(':');
  if (!col || !dir) return null;
  if (!(SORTABLE_COLUMNS as ReadonlyArray<string>).includes(col)) return null;
  if (dir !== 'asc' && dir !== 'desc') return null;
  return { column: col as SortColumn, direction: dir };
}

export function serializeSortToSearchParams(
  sort: SortState | null,
  base: URLSearchParams,
): URLSearchParams {
  const params = new URLSearchParams(base.toString());
  params.delete('sort');
  if (sort) {
    params.set('sort', `${sort.column}:${sort.direction}`);
  }
  return params;
}

/**
 * Default tie-breaker chain (no `?sort=` in the URL):
 *  1. severity desc (P0 → P3)
 *  2. confidence desc (high → low)
 *  3. category asc (canonical ALL_CATEGORIES order)
 *
 * Rank functions are oriented so higher rank = "more severe / more confident /
 * earlier-in-canonical-order"; for `desc` we want the highest rank first,
 * which means a negative cmp when rank(a) > rank(b). Hence the `b - a` form.
 */
function defaultCompare(a: FindingViewModel, b: FindingViewModel): number {
  const sev = severityRank(b.severity) - severityRank(a.severity);
  if (sev !== 0) return sev;
  const conf = confidenceRank(b.confidence) - confidenceRank(a.confidence);
  if (conf !== 0) return conf;
  // Category asc: lowest canonical index first. ALL_CATEGORIES.indexOf gives
  // that directly — we sidestep CATEGORY_RANK here since that map is oriented
  // for desc-style sorting.
  return ALL_CATEGORIES.indexOf(a.category) - ALL_CATEGORIES.indexOf(b.category);
}

function compareBy(
  column: SortColumn,
  a: FindingViewModel,
  b: FindingViewModel,
): number {
  switch (column) {
    case 'severity':
      return severityRank(a.severity) - severityRank(b.severity);
    case 'confidence':
      return confidenceRank(a.confidence) - confidenceRank(b.confidence);
    case 'category':
      return categoryRank(a.category) - categoryRank(b.category);
  }
}

/**
 * Header click cycle: none → desc → asc → none. Per-column state — clicking a
 * different column resets to that column's `desc`.
 */
function nextSortState(
  current: SortState | null,
  column: SortColumn,
): SortState | null {
  if (!current || current.column !== column) {
    return { column, direction: 'desc' };
  }
  if (current.direction === 'desc') return { column, direction: 'asc' };
  return null;
}

function ariaSortFor(
  current: SortState | null,
  column: SortColumn,
): 'ascending' | 'descending' | 'none' {
  if (!current || current.column !== column) return 'none';
  return current.direction === 'asc' ? 'ascending' : 'descending';
}

export interface FindingsTableProps {
  auditId: string;
  findings: FindingViewModel[];
  /**
   * Optional set of finding-ids the user has flagged as false positive. The
   * page owner pre-loads these from Firestore so we don't trigger N reads
   * inside the table. When omitted, the FP filter dimension is a no-op.
   */
  falsePositiveIds?: ReadonlySet<string>;
}

export function FindingsTable({
  auditId,
  findings,
  falsePositiveIds,
}: FindingsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Hydrate from URL on first render — keeps deep-links + browser back stable.
  const [filters, setFilters] = useState<FindingFiltersValue>(() =>
    searchParams ? parseFiltersFromSearchParams(searchParams) : createEmptyFilters(),
  );
  const [sort, setSort] = useState<SortState | null>(() =>
    searchParams ? parseSortFromSearchParams(searchParams) : null,
  );

  // Persist filter/sort state back to the URL with `router.replace` so the
  // browser's history isn't polluted with one entry per chip click.
  useEffect(() => {
    if (!searchParams) return;
    const base = new URLSearchParams(searchParams.toString());
    const withFilters = serializeFiltersToSearchParams(filters, base);
    const next = serializeSortToSearchParams(sort, withFilters);
    const nextStr = next.toString();
    const currentStr = searchParams.toString();
    if (nextStr === currentStr) return;
    const path = pathname ?? '';
    router.replace(nextStr ? `${path}?${nextStr}` : path, { scroll: false });
  }, [filters, sort, searchParams, router, pathname]);

  const filtered = useMemo(() => {
    return findings.filter((f) => {
      if (filters.severities.size > 0 && !filters.severities.has(f.severity)) return false;
      if (filters.categories.size > 0 && !filters.categories.has(f.category)) return false;
      if (filters.confidences.size > 0 && !filters.confidences.has(f.confidence)) return false;
      if (filters.falsePositive !== 'all') {
        const isFp = falsePositiveIds?.has(f.id) ?? false;
        if (filters.falsePositive === 'show' && !isFp) return false;
        if (filters.falsePositive === 'hide' && isFp) return false;
      }
      return true;
    });
  }, [findings, filters, falsePositiveIds]);

  const sorted = useMemo(() => {
    const arr = filtered.slice();
    if (!sort) {
      arr.sort(defaultCompare);
      return arr;
    }
    const sign = sort.direction === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      const primary = compareBy(sort.column, a, b);
      if (primary !== 0) return sign * primary;
      // Stable tie-breaker keeps row order deterministic across columns.
      return defaultCompare(a, b);
    });
    return arr;
  }, [filtered, sort]);

  const handleHeaderClick = useCallback((column: SortColumn) => {
    setSort((current) => nextSortState(current, column));
  }, []);

  function clearAll() {
    setFilters(createEmptyFilters());
    setSort(null);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <aside className="flex flex-col gap-3">
        <Card variant="default" padding="md">
          <CardBody>
            <FindingFilters value={filters} onChange={setFilters} />
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" size="sm" onClick={clearAll}>
                {t('findings.filter.reset')}
              </Button>
            </div>
          </CardBody>
        </Card>
      </aside>

      <Card variant="default" padding="none">
        {sorted.length === 0 ? (
          <CardBody className="px-6 py-16">
            <div className="flex flex-col items-center text-center">
              <h2 className="text-lg text-[color:var(--color-fg-primary)]">
                {t('findings.empty.title')}
              </h2>
              <p className="mt-2 text-sm text-[color:var(--color-fg-secondary)]">
                {t('findings.empty.desc')}
              </p>
            </div>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-auto text-sm">
              <thead className="sticky top-0 z-10 bg-[color:var(--color-bg-elevated)] text-left text-xs text-[color:var(--color-fg-muted)]">
                <tr className="border-b border-[color:var(--color-border-subtle)]">
                  <th className="px-4 py-3 font-medium">{t('findings.column.title')}</th>
                  <SortableHeader
                    label={t('findings.column.category')}
                    column="category"
                    sort={sort}
                    onClick={handleHeaderClick}
                  />
                  <SortableHeader
                    label={t('findings.column.severity')}
                    column="severity"
                    sort={sort}
                    onClick={handleHeaderClick}
                  />
                  <SortableHeader
                    label={t('findings.column.confidence')}
                    column="confidence"
                    sort={sort}
                    onClick={handleHeaderClick}
                  />
                  <th className="px-4 py-3 font-medium">
                    {t('findings.column.actionHint')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((f) => (
                  <tr
                    key={f.id}
                    className="border-b border-[color:var(--color-border-subtle)] last:border-b-0 transition-colors hover:bg-[rgba(255,255,255,0.02)]"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/audits/${auditId}/findings/${f.id}`}
                        className="text-[color:var(--color-fg-primary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                      >
                        {f.title}
                      </Link>
                      <p className="mt-1 text-xs text-[color:var(--color-fg-muted)]">
                        {f.summary}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-[color:var(--color-fg-secondary)]">
                      {categoryLabel(f.category)}
                    </td>
                    <td className="px-4 py-3">
                      <SeverityChip severity={f.severity} showLabel={false} />
                    </td>
                    <td className="px-4 py-3">
                      <ConfidenceChip confidence={f.confidence} showLabel={false} />
                    </td>
                    <td className="px-4 py-3 max-w-[260px]">
                      <ActionHintCell hint={f.actionHint} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function SortableHeader({
  label,
  column,
  sort,
  onClick,
}: {
  label: string;
  column: SortColumn;
  sort: SortState | null;
  onClick: (column: SortColumn) => void;
}) {
  const active = sort?.column === column;
  const ariaSort = ariaSortFor(sort, column);
  const indicator =
    !active ? '↕' : sort.direction === 'asc' ? '▲' : '▼';
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className="px-4 py-3 font-medium"
      data-testid={`sortable-header-${column}`}
    >
      <button
        type="button"
        onClick={() => onClick(column)}
        className="inline-flex items-center gap-1 rounded-sm text-xs text-[color:var(--color-fg-muted)] hover:text-[color:var(--color-fg-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <span>{label}</span>
        <span aria-hidden="true" className="font-mono opacity-70">
          {indicator}
        </span>
      </button>
    </th>
  );
}
