// L-P0-5 (USP-2) — GFM renderer for the PRD Coverage Matrix.
//
// Separates rendering from the matcher so the same builder output can feed both
// the markdown report (this module) and the future HTML React component
// (apps/web). Lives in audit-core to keep the SSOT for §C.3 column rules.

import type { CoverageEvidence, CoverageMatrixEntry } from '@cleartoship/shared-types';
import {
  COVERAGE_MATRIX_CLAIM_CAP,
  summarizeCoverageMatrix,
} from './coverage-matrix.js';

// Spec §C.3 column-width caps. Renderer truncates with ellipsis at these.
const CLAIM_DISPLAY_MAX = 80;
const EVIDENCE_LINE_MAX = 60;
const RECOMMENDATION_MAX = 100;

const STATUS_ICONS = {
  fulfilled: '✅ 충족',
  partial: '⚠️ 미흡',
  unclear: '❓ 불명확',
} as const;

const STATUS_ICON_ONLY = {
  fulfilled: '✅',
  partial: '⚠️',
  unclear: '❓',
} as const;

export interface RenderCoverageMatrixOptions {
  /** Override the per-table row cap (§C.6 — default 50). */
  readonly maxRows?: number;
  /** When true, prepend the §2 section heading. Default: true. */
  readonly includeHeading?: boolean;
  /** Section level (default 2 → `## §2 …`). Useful for embedding. */
  readonly headingLevel?: 2 | 3;
}

/**
 * Render the §2 PRD Coverage Matrix section.
 *
 * Returns the empty string when `entries.length === 0` — caller decides
 * whether to substitute the §C.6 "PRD 없음" CTA placeholder.
 */
export function renderCoverageMatrixMarkdown(
  entries: ReadonlyArray<CoverageMatrixEntry>,
  options: RenderCoverageMatrixOptions = {},
): string {
  if (entries.length === 0) return '';

  const maxRows = options.maxRows ?? COVERAGE_MATRIX_CLAIM_CAP;
  const includeHeading = options.includeHeading ?? true;
  const headingLevel = options.headingLevel ?? 2;
  const hash = '#'.repeat(headingLevel);

  const lines: string[] = [];
  if (includeHeading) {
    lines.push(`${hash} §2 PRD Coverage Matrix`, '');
  }

  const summary = summarizeCoverageMatrix(entries);
  const ratePct = Math.round(summary.fulfillmentRate * 100);
  lines.push(
    `PRD 클레임 ${summary.total}건 중 ✅ 충족 ${summary.fulfilled} / ⚠️ 미흡 ${summary.partial} / ❓ 불명확 ${summary.unclear} (충족률 ${ratePct}%)`,
    '',
  );

  lines.push('| Claim | Status | Evidence | Recommendation |');
  lines.push('| :--- | :---: | :--- | :--- |');

  const visible = entries.slice(0, maxRows);
  for (const entry of visible) {
    lines.push(
      `| ${escapeCell(truncate(entry.claim, CLAIM_DISPLAY_MAX))} | ${STATUS_ICON_ONLY[entry.status]} | ${renderEvidence(entry.evidence)} | ${renderRecommendation(entry)} |`,
    );
  }

  if (entries.length > visible.length) {
    lines.push('');
    lines.push(
      `> claim ${entries.length}건 중 ${visible.length}건 표시. 전체는 JSON export 참조.`,
    );
  }

  lines.push('');
  return lines.join('\n');
}

function renderEvidence(evidence: ReadonlyArray<CoverageEvidence>): string {
  if (evidence.length === 0) return '(detect 안 됨)';
  const parts = evidence.map((ev) => {
    if (ev.type === 'file') return `\`${truncate(ev.path, EVIDENCE_LINE_MAX)}\``;
    if (ev.type === 'finding') return `\`${truncate(ev.findingId, EVIDENCE_LINE_MAX)}\``;
    return `LLM(${ev.confidence.toFixed(2)})`;
  });
  return escapeCell(parts.join(' + '));
}

function renderRecommendation(entry: CoverageMatrixEntry): string {
  if (entry.status === 'fulfilled') return '—';
  const rec = entry.recommendation?.trim();
  if (!rec) return '구현 또는 PRD 수정';
  return escapeCell(truncate(rec, RECOMMENDATION_MAX));
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

// GFM cells: pipes and newlines break table layout. Replace both.
function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export { STATUS_ICONS };
