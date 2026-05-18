// W2.C8.1 — PRD Coverage Matrix UI component (Sprint 4 §2.8 / Batch B).
//
// Renders the per-claim coverage table that the audit-core matcher builds
// (`packages/audit-core/src/coverage-matrix.ts`) and that the Markdown reporter
// renders to GFM (`render-coverage-matrix.ts`). This component is the HTML
// twin of that GFM table — same row semantics, but with sticky headers, a
// scroll hint for narrow viewports, and an accessible status badge instead
// of an emoji glyph.
//
// SSOT note: the matcher and renderer live in audit-core. This file is a
// pure render of the already-computed entries — it never re-derives status
// or recommendation. The shared-types `CoverageStatus` enum is 3-state
// (fulfilled/partial/unclear); the UI promotes a LOW-confidence `unclear`
// row to a 4th visual `na` badge so a thin-signal row reads as "inconclusive"
// rather than a hard "missing" verdict. The matcher's own truth value is
// unchanged — see badgeVariantFor() below.

import type { CoverageEvidence, CoverageMatrixEntry } from '@cleartoship/shared-types';
import { ChevronRight } from 'lucide-react';
import { t } from '@/lib/i18n';
import type { I18nKey } from '@/lib/i18n';

// Public type alias: matches the optional `AuditReport.coverageMatrix` shape
// so callers can pass `report.coverageMatrix` directly without `undefined`
// pre-checks (we render the empty-state copy when the array is empty).
export type CoverageMatrix = ReadonlyArray<CoverageMatrixEntry>;

export interface CoverageMatrixProps {
  readonly matrix: CoverageMatrix;
}

type BadgeVariant = 'covered' | 'partial' | 'missing' | 'na';

const BADGE_LABEL_KEY: Record<BadgeVariant, I18nKey> = {
  covered: 'coverage.status.covered',
  partial: 'coverage.status.partial',
  missing: 'coverage.status.missing',
  na: 'coverage.status.na',
};

// Semantic color tokens — kept inline (mirrors profile-badge / FCS pattern) so
// the 4-state palette ships as one block. WCAG 2.1 AA contrast: each token
// is paired with a 12% tinted background + 28% border (color-mix in oklch),
// then the foreground text uses the full token — same contrast envelope as
// the existing severity chips on the dashboard.
const BADGE_TOKEN: Record<BadgeVariant, string> = {
  covered: 'var(--color-severity-p3)', // green
  partial: 'var(--color-severity-p1)', // amber
  missing: 'var(--color-severity-p0)', // red
  na: 'var(--color-fg-muted)', // gray
};

/**
 * Map the 3-state audit-core CoverageStatus onto the 4 visual badge variants.
 *
 * - `fulfilled` → `covered` (green)
 * - `partial`   → `partial` (amber)
 * - `unclear` + confidence=LOW → `na` (gray, "inconclusive")
 * - `unclear` otherwise        → `missing` (red)
 *
 * The LOW-confidence promotion is a UI-only kindness — the underlying entry
 * is still `unclear`, so JSON exports / Markdown reports keep their original
 * verdict.
 */
function badgeVariantFor(entry: CoverageMatrixEntry): BadgeVariant {
  if (entry.status === 'fulfilled') return 'covered';
  if (entry.status === 'partial') return 'partial';
  return entry.confidence === 'LOW' ? 'na' : 'missing';
}

export function CoverageMatrix({ matrix }: CoverageMatrixProps) {
  if (matrix.length === 0) {
    return (
      <p
        role="status"
        data-testid="coverage-empty"
        className="rounded-mk border border-dashed border-[color:var(--color-border-default)] p-6 text-sm text-[color:var(--color-fg-muted)]"
      >
        {t('coverage.empty')}
      </p>
    );
  }

  return (
    <section
      aria-labelledby="coverage-matrix-heading"
      className="flex flex-col gap-2"
    >
      <h2 id="coverage-matrix-heading" className="sr-only">
        PRD Coverage Matrix
      </h2>
      <div
        data-testid="coverage-scroll-container"
        className="relative overflow-x-auto overflow-y-auto max-h-[60vh] rounded-mk border border-app-border bg-mk-bg-soft"
      >
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                data-testid="coverage-col-header-claim"
                className="sticky top-0 left-0 z-30 bg-mk-bg-soft px-3 py-2 text-xs font-medium text-[color:var(--color-fg-muted)]"
              >
                Claim
              </th>
              <th
                scope="col"
                data-testid="coverage-col-header-status"
                className="sticky top-0 z-20 bg-mk-bg-soft px-3 py-2 text-xs font-medium text-[color:var(--color-fg-muted)]"
              >
                Status
              </th>
              <th
                scope="col"
                data-testid="coverage-col-header-evidence"
                className="sticky top-0 z-20 bg-mk-bg-soft px-3 py-2 text-xs font-medium text-[color:var(--color-fg-muted)]"
              >
                Evidence
              </th>
              <th
                scope="col"
                data-testid="coverage-col-header-recommendation"
                className="sticky top-0 z-20 bg-mk-bg-soft px-3 py-2 text-xs font-medium text-[color:var(--color-fg-muted)]"
              >
                Recommendation
              </th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((entry, idx) => (
              <CoverageRow key={`${idx}-${entry.claim.slice(0, 24)}`} entry={entry} />
            ))}
          </tbody>
        </table>

        <ScrollHint />
      </div>
    </section>
  );
}

function CoverageRow({ entry }: { entry: CoverageMatrixEntry }) {
  const variant = badgeVariantFor(entry);
  // TODO(Wave 3 §A.4.3): once audit-core exposes primaryPath fallback for
  // missing-claim rows, surface it here as a secondary cell label.
  return (
    <tr
      data-testid="coverage-row"
      data-status={entry.status}
      data-variant={variant}
      className="border-t border-app-border align-top"
    >
      <th
        scope="row"
        data-testid="coverage-row-header"
        className="sticky left-0 z-10 bg-mk-bg-soft px-3 py-2 font-normal text-[color:var(--color-fg-primary)]"
      >
        <span className="block max-w-[24rem] truncate" title={entry.claim}>
          {entry.claim}
        </span>
      </th>
      <td className="px-3 py-2">
        <CoverageBadge variant={variant} />
      </td>
      <td className="px-3 py-2 text-[color:var(--color-fg-secondary)]">
        <EvidenceList evidence={entry.evidence} />
      </td>
      <td className="px-3 py-2 text-[color:var(--color-fg-secondary)]">
        {entry.recommendation ? entry.recommendation : <span aria-hidden="true">—</span>}
      </td>
    </tr>
  );
}

function CoverageBadge({ variant }: { variant: BadgeVariant }) {
  const color = BADGE_TOKEN[variant];
  const label = t(BADGE_LABEL_KEY[variant]);
  return (
    <span
      role="status"
      data-testid="coverage-badge"
      data-variant={variant}
      className="inline-flex h-6 max-w-fit items-center gap-1.5 rounded-full px-2 text-[11px] font-medium"
      style={{
        color,
        background: `color-mix(in oklch, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in oklch, ${color} 28%, transparent)`,
      }}
      aria-label={label}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: color }}
      />
      <span>{label}</span>
    </span>
  );
}

function EvidenceList({ evidence }: { evidence: ReadonlyArray<CoverageEvidence> }) {
  if (evidence.length === 0) {
    return <span className="text-[color:var(--color-fg-muted)]">—</span>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {evidence.map((ev, idx) => (
        <li key={`${idx}-${evidenceKey(ev)}`} className="font-mono text-xs">
          {renderEvidence(ev)}
        </li>
      ))}
    </ul>
  );
}

function evidenceKey(ev: CoverageEvidence): string {
  if (ev.type === 'file') return `file:${ev.path}`;
  if (ev.type === 'finding') return `finding:${ev.findingId}`;
  return `llm:${ev.confidence}`;
}

function renderEvidence(ev: CoverageEvidence): string {
  if (ev.type === 'file') return ev.path;
  if (ev.type === 'finding') return ev.findingId;
  return `LLM(${ev.confidence.toFixed(2)})`;
}

function ScrollHint() {
  return (
    <div
      data-testid="coverage-scroll-hint"
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 right-0 flex w-12 items-center justify-end bg-gradient-to-l from-mk-bg-soft to-transparent pr-1"
    >
      <span className="sr-only">{t('coverage.scrollHint')}</span>
      <ChevronRight
        size={16}
        className="text-[color:var(--color-fg-muted)]"
        aria-hidden="true"
      />
    </div>
  );
}
