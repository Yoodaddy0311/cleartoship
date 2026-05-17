import type {
  AuditCategory,
  CategoryScore,
  Finding,
  LaunchStatus,
  Severity,
} from '@cleartoship/shared-types';
import { CATEGORY_META } from './checklist-mapping.js';

/**
 * Pure scoring per `03_audit_checklist_scoring_rubric.md` §13.
 *
 *   - Each category starts at 100 and is deducted per open finding.
 *   - P1 fail = -8, P2 = -4, P3 = -1.
 *   - Any P0 in a category caps that category at 60.
 *   - Overall = weighted average using CATEGORY_META weights.
 *   - If P0 count >= 3, launchStatus is forced to NOT_READY regardless of score.
 *
 * Coverage signal (SCORE-1):
 *   Originated from a user report — empty-graph repos were still scoring ~96.
 *   When the optional `coverage` block is supplied we discount the
 *   readinessScore by a confidence multiplier so an audit with no analyzable
 *   surface cannot quietly produce a high number.
 *
 *   confidenceMultiplier = product of:
 *     - featureNodeCount === 0       → 0.5
 *     - analyzedFileCount < 10       → 0.7
 *     - deployUrlReachable === false → 0.8
 *     - toolsAvailableRatio < 0.5    → 0.7   (SCORE-1B-a)
 *
 *   In addition:
 *     - When featureNodeCount === 0, intent/coverage categories
 *       (PRODUCT_INTENT, REQUIREMENT_COVERAGE — the enum members that map to
 *       the spec's INTENT_ALIGNMENT / DESIGN_CONSISTENCY notion in this repo)
 *       are reported as `null` (N/A) and excluded from the weighted overall.
 *     - When confidenceMultiplier < 0.6, launchStatus is forced to
 *       'INDETERMINATE' regardless of the numeric score.
 *
 * measuredBy signal (SCORE-1B-a):
 *   A category with an empty CategoryMeta.measuredBy list has no pipeline
 *   step producing findings for it today. Such categories would otherwise
 *   stay at the 100 baseline and inflate the overall score. They are reported
 *   as null (N/A) and excluded from the weighted average regardless of any
 *   coverage signal.
 *
 *   Backward compatibility: omitting `coverage` and `availableTools` keeps
 *   the multiplier at 1; categories without measuredBy still surface as N/A,
 *   but the weighted average over the remaining (measured) categories matches
 *   prior behavior for those categories.
 */

const SEVERITY_DEDUCTION: Record<Severity, number> = {
  P0: 0, // P0 uses the cap mechanism instead of a linear deduction.
  P1: 8,
  P2: 4,
  P3: 1,
};

const P0_CATEGORY_CAP = 60;

/**
 * Categories that depend on intent/requirement coverage signals. When no
 * feature nodes were detected these cannot be meaningfully scored. The spec
 * refers to INTENT_ALIGNMENT / PRODUCT_INTENT / DESIGN_CONSISTENCY; this
 * codebase's AuditCategory enum only defines PRODUCT_INTENT and
 * REQUIREMENT_COVERAGE, which are the closest matches.
 */
const COVERAGE_DEPENDENT_CATEGORIES: ReadonlySet<AuditCategory> = new Set([
  'PRODUCT_INTENT',
  'REQUIREMENT_COVERAGE',
]);

const INDETERMINATE_MULTIPLIER_THRESHOLD = 0.6;
const ANALYZED_FILE_LOW_THRESHOLD = 10;
const TOOLS_AVAILABLE_LOW_THRESHOLD = 0.5;

const MULT_ZERO_NODES = 0.5;
const MULT_LOW_FILES = 0.7;
const MULT_UNREACHABLE_DEPLOY = 0.8;
const MULT_FEW_TOOLS = 0.7;

export interface CoverageInput {
  /** Detected nodes from the FEATURE_GRAPH pipeline (pages/api/etc). */
  readonly featureNodeCount?: number;
  /** Count of files actually walked by static analysis. */
  readonly analyzedFileCount?: number;
  /** Whether deployUrl was reachable for dynamic analysis. */
  readonly deployUrlReachable?: boolean;
}

/**
 * Whether each external scanner CLI is installed on the worker. Drives the
 * "few tools available" confidence penalty — a host with no scanners produces
 * no security findings, which is indistinguishable from a clean repo, so we
 * cannot trust the resulting score.
 */
export interface AvailableTools {
  readonly semgrep: boolean;
  readonly osvScanner: boolean;
  readonly lighthouse: boolean;
  readonly secretsScanner: boolean;
}

export interface ScoringInput {
  readonly findings: ReadonlyArray<Pick<Finding, 'category' | 'severity'>>;
  readonly coverage?: CoverageInput;
  readonly availableTools?: AvailableTools;
}

export interface ScoringResult {
  readinessScore: number;
  launchStatus: LaunchStatus;
  categoryScores: CategoryScore[];
  severityCounts: Record<Severity, number>;
  /** Composite confidence multiplier applied to the weighted readinessScore. */
  confidenceMultiplier: number;
  /** Fraction of scanner tools available (0..1). Undefined when not supplied. */
  toolsAvailableRatio?: number;
}

export function calculateScores(input: ScoringInput): ScoringResult {
  const severityCounts: Record<Severity, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  const perCategory = new Map<
    AuditCategory,
    { score: number; hasP0: boolean }
  >();

  for (const meta of CATEGORY_META) {
    perCategory.set(meta.category, { score: 100, hasP0: false });
  }

  for (const finding of input.findings) {
    severityCounts[finding.severity] += 1;
    const bucket = perCategory.get(finding.category);
    if (!bucket) continue;
    if (finding.severity === 'P0') {
      bucket.hasP0 = true;
    } else {
      bucket.score = Math.max(0, bucket.score - SEVERITY_DEDUCTION[finding.severity]);
    }
  }

  for (const bucket of perCategory.values()) {
    if (bucket.hasP0) {
      bucket.score = Math.min(bucket.score, P0_CATEGORY_CAP);
    }
  }

  const coverage = input.coverage;
  const toolsAvailableRatio = computeToolsAvailableRatio(input.availableTools);
  const confidenceMultiplier = computeConfidenceMultiplier(coverage, toolsAvailableRatio);
  // Only mark coverage-dependent N/A when caller actually passed coverage AND
  // featureNodeCount is 0 (preserves backward compatibility for callers that
  // omit coverage).
  const zeroFeatureNodes = coverage?.featureNodeCount === 0;

  let weightedSum = 0;
  let totalWeight = 0;
  const categoryScores: CategoryScore[] = [];
  for (const meta of CATEGORY_META) {
    const bucket = perCategory.get(meta.category);
    if (!bucket) continue;
    // Two independent reasons a category may be N/A:
    //   1) no pipeline step produces findings for it (measuredBy empty) →
    //      score=null always, since "100 baseline" carries no signal.
    //   2) zero feature nodes AND it depends on coverage signals
    //      (PRODUCT_INTENT / REQUIREMENT_COVERAGE).
    const noMeasurement = meta.measuredBy.length === 0;
    const coverageNA = zeroFeatureNodes && COVERAGE_DEPENDENT_CATEGORIES.has(meta.category);
    const isNA = noMeasurement || coverageNA;
    const score = isNA ? null : Math.round(bucket.score);
    if (!isNA && meta.weight > 0) {
      weightedSum += bucket.score * meta.weight;
      totalWeight += meta.weight;
    }
    categoryScores.push({
      category: meta.category,
      score,
      label: meta.label,
      summary: null,
    });
  }

  const rawReadiness = totalWeight === 0 ? 0 : weightedSum / totalWeight;
  const readinessScore = Math.round(rawReadiness * confidenceMultiplier);
  const launchStatus = classifyLaunchStatus(
    readinessScore,
    severityCounts.P0,
    confidenceMultiplier,
  );

  const result: ScoringResult = {
    readinessScore,
    launchStatus,
    categoryScores,
    severityCounts,
    confidenceMultiplier,
  };
  if (toolsAvailableRatio !== undefined) {
    result.toolsAvailableRatio = toolsAvailableRatio;
  }
  return result;
}

/**
 * Product of independent confidence penalties. Returns 1 when no signal is
 * supplied so existing callers see identical behavior.
 */
function computeConfidenceMultiplier(
  coverage: CoverageInput | undefined,
  toolsAvailableRatio: number | undefined,
): number {
  let m = 1;
  if (coverage) {
    if (coverage.featureNodeCount === 0) m *= MULT_ZERO_NODES;
    if (
      coverage.analyzedFileCount !== undefined &&
      coverage.analyzedFileCount < ANALYZED_FILE_LOW_THRESHOLD
    ) {
      m *= MULT_LOW_FILES;
    }
    if (coverage.deployUrlReachable === false) m *= MULT_UNREACHABLE_DEPLOY;
  }
  if (
    toolsAvailableRatio !== undefined &&
    toolsAvailableRatio < TOOLS_AVAILABLE_LOW_THRESHOLD
  ) {
    m *= MULT_FEW_TOOLS;
  }
  return m;
}

function computeToolsAvailableRatio(tools: AvailableTools | undefined): number | undefined {
  if (!tools) return undefined;
  const total = 4;
  const available =
    Number(tools.semgrep) +
    Number(tools.osvScanner) +
    Number(tools.lighthouse) +
    Number(tools.secretsScanner);
  return available / total;
}

function classifyLaunchStatus(
  score: number,
  p0Count: number,
  confidenceMultiplier: number,
): LaunchStatus {
  if (confidenceMultiplier < INDETERMINATE_MULTIPLIER_THRESHOLD) return 'INDETERMINATE';
  if (p0Count >= 3) return 'NOT_READY';
  if (score >= 85) return 'READY';
  if (score >= 70) return 'CONDITIONAL';
  if (score >= 55) return 'NEEDS_WORK';
  if (score >= 40) return 'AT_RISK';
  return 'NOT_READY';
}
