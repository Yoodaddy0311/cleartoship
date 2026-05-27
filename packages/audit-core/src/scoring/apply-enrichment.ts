import type { AuditEnrichment, CategoryScore } from '@cleartoship/shared-types';
import { blendScores } from './blend-scores.js';

/**
 * Audit Quality Roadmap §6 — merge an opt-in L-bucket enrichment into the
 * deterministic category scores.
 *
 * The async enrichment job (Claude Agent SDK running the audit-* skills)
 * produces an `AuditEnrichment` (per-category `scoreL` + narrative). This pure
 * function folds it into the report's `categoryScores`: each enriched category
 * is blended with its existing D score (`blendScores`, §6.5), the blended
 * origin ('L' | 'mixed') is written so the dashboard's AI-assisted badge shows,
 * and the skill's narrative becomes the category `summary`. A D+L conflict is
 * surfaced with a ⚠️ prefix (§7.3) rather than being silently averaged away.
 *
 * Categories with no enrichment entry pass through unchanged. Returns a NEW
 * array (immutable) — the deterministic input is never mutated.
 */

/** Per-category token budget for the enrichment job (§6.6). */
export const ENRICHMENT_TOKEN_BUDGET_PER_CATEGORY = 5000;

/**
 * Cache key so a re-audit of the same commit reuses the L-judgment (§6.6).
 * `commitSha` null → a stable "no commit" key (still de-dupes within a run).
 */
export function enrichmentCacheKey(commitSha: string | null, category: string): string {
  return `${commitSha ?? 'nocommit'}:${category}`;
}

export function applyEnrichment(
  categoryScores: ReadonlyArray<CategoryScore>,
  enrichment: AuditEnrichment | null | undefined,
): CategoryScore[] {
  // Only a completed enrichment with entries changes anything. Anything else
  // (absent / PENDING / SKIPPED / ERROR / empty) passes the D scores through.
  if (!enrichment || enrichment.status !== 'DONE' || enrichment.categories.length === 0) {
    return categoryScores.map((c) => ({ ...c }));
  }
  const byCategory = new Map(enrichment.categories.map((e) => [e.category, e]));
  return categoryScores.map((c) => {
    const e = byCategory.get(c.category);
    if (!e) return { ...c };
    const blended = blendScores({ scoreD: c.score, scoreL: e.scoreL });
    const summary = blended.conflict ? `⚠️ ${e.narrative}` : e.narrative;
    return {
      ...c,
      score: blended.score,
      origin: blended.origin,
      summary,
    };
  });
}
