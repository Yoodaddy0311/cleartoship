import type { ScoreOrigin } from '@cleartoship/shared-types';

/**
 * Audit Quality Roadmap §5.5 — Pattern Library scoring model.
 *
 * Phase 1.3 gave the structural categories a coarse inventory *baseline*
 * (50–75 = "structure detected"). Phase 2 refines that with a Pattern Library:
 * each category declares 8–15 deterministic patterns; a matched pattern nudges
 * the score up or down from a baseline. This mirrors Claude-BugHunter's
 * `hunt-*.md` per-category pattern docs, but every pattern here is a
 * deterministic check over data the pipeline already has (file tree, route /
 * data-model inventory, W1-A markers) — origin stays 'D', no LLM.
 *
 * The model is intentionally tiny and pure so per-category detector modules
 * (`frontend-code-patterns.ts`, `maintainability-patterns.ts`, …) only have to
 * produce a `PatternEvidence[]` and call `scoreFromPatterns`.
 */

export interface PatternEvidence {
  /** Stable id, e.g. 'FE-component-count'. Used for evidence + docs cross-ref. */
  readonly patternId: string;
  /** Whether the pattern's signal was found in the repo. */
  readonly matched: boolean;
  /**
   * Score delta applied when `matched` is true. Positive for healthy signals
   * (tests present), negative for risk signals (no error boundary). A pattern
   * that is `matched: false` contributes 0 — absence is neutral, not a
   * penalty, unless you model the *risk* as its own pattern.
   */
  readonly scoreImpact: number;
  /** Human-readable evidence string surfaced in the report / future cards. */
  readonly evidence: string;
}

export interface PatternScoreResult {
  /** Final score, clamped to 0–100. */
  readonly score: number;
  /** Always 'D' — every pattern is a deterministic check. */
  readonly origin: Extract<ScoreOrigin, 'D'>;
  /**
   * Confidence in the aggregate score. HIGH once ≥5 patterns were evaluated
   * (enough signal to trust the number); MEDIUM below that. Mirrors §5.5.
   */
  readonly confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  /** The patterns that actually matched, for evidence rendering. */
  readonly matched: ReadonlyArray<PatternEvidence>;
}

/** Patterns evaluated threshold for HIGH confidence (§5.5). */
export const PATTERN_HIGH_CONFIDENCE_COUNT = 5;
/** Default Pattern Library baseline (§5.5). */
export const PATTERN_BASELINE = 50;

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Aggregate a category's pattern evidence into a single deterministic score.
 *
 *   score = clamp( baseline + Σ scoreImpact[matched] , 0, 100 )
 *
 * `confidence` reflects how many patterns were evaluated (not how many
 * matched): a category with only 2 patterns can't be HIGH-confidence even if
 * both matched. An empty pattern set returns the baseline at LOW confidence so
 * callers can decide to treat it as N/A rather than a spurious 50.
 */
export function scoreFromPatterns(
  patterns: ReadonlyArray<PatternEvidence>,
  baseline: number = PATTERN_BASELINE,
): PatternScoreResult {
  const delta = patterns.reduce(
    (acc, p) => acc + (p.matched ? p.scoreImpact : 0),
    0,
  );
  const matched = patterns.filter((p) => p.matched);
  let confidence: PatternScoreResult['confidence'];
  if (patterns.length === 0) {
    confidence = 'LOW';
  } else if (patterns.length >= PATTERN_HIGH_CONFIDENCE_COUNT) {
    confidence = 'HIGH';
  } else {
    confidence = 'MEDIUM';
  }
  return {
    score: clampScore(baseline + delta),
    origin: 'D',
    confidence,
    matched,
  };
}
