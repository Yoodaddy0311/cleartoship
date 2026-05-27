import type { ScoreOrigin } from '@cleartoship/shared-types';

/**
 * Audit Quality Roadmap §6.5 — D + L score blend.
 *
 * The deterministic pipeline (D) and the opt-in LLM skill bundle (L) can each
 * produce a score for a category. This pure function combines them into the
 * single value the dashboard shows, with an honest origin + confidence:
 *
 *   - D only  → 'D',  the deterministic number (HIGH — reproducible).
 *   - L only  → 'L',  the skill's number (LOW — a single soft signal, §7.3).
 *   - both    → 'mixed', D-weighted blend (D anchors, L nuances). HIGH when D
 *               and L agree within ±15; otherwise the disagreement is surfaced
 *               as a conflict (LOW + `conflict: true`) — never silently averaged
 *               away (§7.3).
 *   - neither → 'none' (the category stays N/A).
 *
 * Pure: no I/O, no mutation. The worker / an enrichment job injects the L score;
 * this module owns only the combination rule so the dashboard and any consumer
 * share one source of truth.
 */

/** D weight in the mixed blend (deterministic anchors the result). */
export const L_BLEND_D_WEIGHT = 0.6;
/** L weight in the mixed blend. */
export const L_BLEND_L_WEIGHT = 0.4;
/** Max |D − L| gap still treated as agreement (HIGH confidence). */
export const L_BLEND_AGREEMENT_DELTA = 15;

export interface BlendInput {
  /** Deterministic score (0–100), or null when D left the category N/A. */
  readonly scoreD: number | null;
  /** LLM-assisted score (0–100), or null when no skill judged it. */
  readonly scoreL: number | null;
}

export interface BlendResult {
  /** Final score, clamped 0–100, or null when neither side scored. */
  readonly score: number | null;
  readonly origin: ScoreOrigin;
  readonly confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  /** True only when D and L both exist but disagree beyond the delta. */
  readonly conflict: boolean;
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function blendScores({ scoreD, scoreL }: BlendInput): BlendResult {
  // Both present → D-weighted blend (checked first so TS narrows both operands).
  if (scoreD !== null && scoreL !== null) {
    const blended = clampScore(scoreD * L_BLEND_D_WEIGHT + scoreL * L_BLEND_L_WEIGHT);
    const conflict = Math.abs(scoreD - scoreL) > L_BLEND_AGREEMENT_DELTA;
    return {
      score: blended,
      origin: 'mixed',
      confidence: conflict ? 'LOW' : 'HIGH',
      conflict,
    };
  }
  if (scoreD !== null) {
    return { score: clampScore(scoreD), origin: 'D', confidence: 'HIGH', conflict: false };
  }
  if (scoreL !== null) {
    // L on its own is a single soft signal — honest LOW confidence (§7.3).
    return { score: clampScore(scoreL), origin: 'L', confidence: 'LOW', conflict: false };
  }
  return { score: null, origin: 'none', confidence: 'LOW', conflict: false };
}
