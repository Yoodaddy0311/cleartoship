import type {
  AuditEnrichment,
  AuditReport,
  AuditRun,
  CategoryEnrichment,
} from '@cleartoship/shared-types';
import { ENRICHMENT_TOKEN_BUDGET_PER_CATEGORY } from '@cleartoship/audit-core';
import {
  ENRICHABLE_CATEGORIES,
  type EnrichableCategory,
  type LlmProvider,
  type SkillLoader,
} from './types.js';

/** Skill bundle name per enrichable category. */
const SKILL_BY_CATEGORY: Record<EnrichableCategory, string> = {
  PRODUCT_INTENT: 'audit-product-intent',
  REQUIREMENT_COVERAGE: 'audit-requirement-coverage',
};

/** Keep the PRD / large free text within the per-category token budget. */
const PRD_CONTEXT_CHAR_CAP = 8000;

function truncate(text: string, cap: number): string {
  return text.length <= cap ? text : `${text.slice(0, cap)}\n…[truncated ${text.length - cap} chars]`;
}

/** Compact, machine-readable summary of the deterministic category scores. */
function categoryScoreLines(report: AuditReport): string {
  return report.categoryScores
    .map((c) => `- ${c.category}: ${c.score === null ? 'N/A' : c.score} (origin ${c.origin ?? 'none'})`)
    .join('\n');
}

/**
 * Build the per-category context the skill reasons over. Deliberately compact —
 * the deterministic report summary + scores for every category, plus the
 * category-specific raw input (repo URL for PRODUCT_INTENT, the uploaded PRD
 * for REQUIREMENT_COVERAGE). The skill is responsible for honest sourcing.
 */
export function buildContext(
  category: EnrichableCategory,
  run: AuditRun,
  report: AuditReport,
): string {
  const head = [
    `Repository: ${run.repoUrl}`,
    `Deploy URL: ${run.deployUrl ?? '(none)'}`,
    `Readiness score: ${report.readinessScore} (${report.launchStatus})`,
    `Executive summary: ${report.executiveSummary}`,
    report.launchGate ? `Launch gate verdict: ${report.launchGate.verdict} — ${report.launchGate.rationale}` : '',
    '',
    'Deterministic category scores:',
    categoryScoreLines(report),
  ]
    .filter(Boolean)
    .join('\n');

  if (category === 'REQUIREMENT_COVERAGE') {
    const prd = run.prdText ? truncate(run.prdText, PRD_CONTEXT_CHAR_CAP) : '(no PRD supplied)';
    return `${head}\n\nUploaded PRD / spec:\n${prd}`;
  }
  // PRODUCT_INTENT — the report markdown carries the README-derived signals the
  // deterministic pass surfaced; include a bounded slice for claim checking.
  return `${head}\n\nReport excerpt:\n${truncate(report.markdown, PRD_CONTEXT_CHAR_CAP)}`;
}

export interface RunEnrichmentArgs {
  readonly run: AuditRun;
  readonly report: AuditReport;
  readonly provider: LlmProvider;
  readonly loadSkill: SkillLoader;
  /** Injected for testability; defaults to console.error. */
  readonly onError?: (category: EnrichableCategory, err: unknown) => void;
}

/**
 * Run the opt-in L-bucket enrichment for a completed audit. For each enrichable
 * category it loads the skill, builds context, and calls the LLM provider under
 * a per-category token budget. A null score (skill judged it not measurable) or
 * a per-category error is dropped — the category stays N/A rather than getting a
 * fabricated number, and one failure never aborts the others. Returns an
 * `AuditEnrichment` ready to persist on the report.
 */
export async function runEnrichment(args: RunEnrichmentArgs): Promise<AuditEnrichment> {
  const { run, report, provider, loadSkill } = args;
  const onError = args.onError ?? defaultOnError;
  const categories: CategoryEnrichment[] = [];
  let totalTokens = 0;

  for (const category of ENRICHABLE_CATEGORIES) {
    // REQUIREMENT_COVERAGE is not measurable without a spec — skip honestly.
    if (category === 'REQUIREMENT_COVERAGE' && !run.prdText) continue;
    try {
      const skillBody = loadSkill(SKILL_BY_CATEGORY[category]);
      const context = buildContext(category, run, report);
      const res = await provider.judge({
        category,
        skillBody,
        context,
        maxTokens: ENRICHMENT_TOKEN_BUDGET_PER_CATEGORY,
      });
      totalTokens += res.tokensUsed;
      if (res.scoreL === null) continue; // skill judged it not measurable
      categories.push({
        category,
        scoreL: res.scoreL,
        narrative: res.narrative,
        confidence: res.confidence,
        sources: [...res.sources],
      });
    } catch (err) {
      onError(category, err);
    }
  }

  return {
    status: categories.length > 0 ? 'DONE' : 'SKIPPED',
    commitSha: run.commitHash,
    categories,
    totalTokens,
    generatedAt: new Date().toISOString(),
  };
}

function defaultOnError(category: EnrichableCategory, err: unknown): void {
  process.stderr.write(
    JSON.stringify({
      level: 'error',
      component: 'enrichment.orchestrator',
      message: `enrichment failed for ${category}`,
      error: err instanceof Error ? err.message : String(err),
      ts: new Date().toISOString(),
    }) + '\n',
  );
}
