import type { Confidence } from '@cleartoship/shared-types';

/**
 * The two categories the deterministic audit leaves N/A by design (roadmap §6)
 * — they require natural-language judgment, so the opt-in enrichment job runs
 * the matching `audit-*` skill for each.
 */
export const ENRICHABLE_CATEGORIES = ['PRODUCT_INTENT', 'REQUIREMENT_COVERAGE'] as const;
export type EnrichableCategory = (typeof ENRICHABLE_CATEGORIES)[number];

export interface EnrichmentLlmRequest {
  readonly category: EnrichableCategory;
  /** The skill's SKILL.md body (frontmatter stripped), used as the system prompt. */
  readonly skillBody: string;
  /** The compact audit context (report summary + PRD + repo metadata). */
  readonly context: string;
  /** Hard cap on output tokens for this category (§6.6 budget). */
  readonly maxTokens: number;
}

export interface EnrichmentLlmResponse {
  /**
   * 0–100 score, or `null` when the skill judged the category genuinely not
   * measurable (e.g. REQUIREMENT_COVERAGE with no PRD, or an unreadable README).
   * A null result is dropped by the orchestrator → the category stays N/A
   * rather than getting a fabricated number.
   */
  readonly scoreL: number | null;
  readonly narrative: string;
  readonly confidence: Confidence;
  readonly sources: ReadonlyArray<string>;
  /** Total tokens (input + output) the call consumed, for cost surfacing (§6.6). */
  readonly tokensUsed: number;
}

/**
 * Pluggable LLM backend. The Anthropic implementation lives in
 * `anthropic-provider.ts`; tests inject a deterministic fake. Keeping the
 * interface free of any SDK type means the orchestrator + its tests compile
 * and run without the `@anthropic-ai/sdk` dependency present.
 */
export interface LlmProvider {
  judge(req: EnrichmentLlmRequest): Promise<EnrichmentLlmResponse>;
}

/** Loads a skill's SKILL.md body (frontmatter stripped) by skill name. */
export type SkillLoader = (skillName: string) => string;
