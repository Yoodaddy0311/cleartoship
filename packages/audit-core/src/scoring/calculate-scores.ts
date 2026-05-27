import type {
  AuditCategory,
  AuditStep,
  CategoryScore,
  Confidence,
  DataModelInventory,
  FCSResult,
  Finding,
  LaunchGateResult,
  LaunchStatus,
  RepoMetadata,
  RouteInventory,
  ScoreOrigin,
  Severity,
} from '@cleartoship/shared-types';
import { CATEGORY_META } from './checklist-mapping.js';
import { deriveInventoryBaselines } from './inventory-scoring.js';
import { evaluateLaunchGate } from '../launch-gate/seven-question-gate.js';
import { applyProfileWeights, type AuditProfile } from '../profiles/index.js';
import { computeFCS } from '../fcs/compute-fcs.js';

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
 * W3.CLN.4 — deterministic ordering of categoryScores.
 *
 * Sort policy (see `docs/ADR/2026-05-18-business-readiness-tie-break.md`):
 *   1. score desc — higher-scored categories surface first so the dashboard
 *      reads as "what is healthy" → "what needs attention" (null = N/A sorts
 *      to the bottom of the score band, treated as -1 for ordering only).
 *   2. category weight desc — among tied scores, heavier-weight categories
 *      (SECURITY_PRIVACY 15, BACKEND_API 15, UX_UI 15) dominate over
 *      lighter ones so technical risk is never buried by polish.
 *   3. BUSINESS_READINESS is forced last on any remaining tie — it is a meta
 *      category (Pricing/Legal/Onboarding) and must yield to technical
 *      categories when scores match.
 *   4. CATEGORY_META declaration order as the final stable tie-breaker.
 *
 * The function is exported so UI consumers (CategoryGrid §C.6) and report
 * renderers can share a single source of truth for ordering — preventing
 * the dashboard and the markdown report from drifting.
 */
const BUSINESS_READINESS_TIE_BREAK_SENTINEL = 1; // higher = comes later
const NON_BUSINESS_READINESS_SENTINEL = 0;

// Resolves the CATEGORY_META index lazily (avoid TDZ across module imports;
// checklist-mapping declares CATEGORY_META above this file's import).
function getCategoryMetaIndex(category: AuditCategory): number {
  const idx = CATEGORY_META.findIndex((m) => m.category === category);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

function getCategoryWeight(category: AuditCategory): number {
  const meta = CATEGORY_META.find((m) => m.category === category);
  return meta?.weight ?? 0;
}

export function compareCategoryScoresWithTieBreak(
  a: CategoryScore,
  b: CategoryScore,
): number {
  // 1) score desc (null treated as -1 so N/A sinks below any numeric score)
  const sa = a.score ?? -1;
  const sb = b.score ?? -1;
  if (sa !== sb) return sb - sa;

  // 2) category weight desc (heavier technical categories win the tie)
  const wa = getCategoryWeight(a.category);
  const wb = getCategoryWeight(b.category);
  if (wa !== wb) return wb - wa;

  // 3) BUSINESS_READINESS forced last on remaining ties.
  const ba =
    a.category === 'BUSINESS_READINESS'
      ? BUSINESS_READINESS_TIE_BREAK_SENTINEL
      : NON_BUSINESS_READINESS_SENTINEL;
  const bb =
    b.category === 'BUSINESS_READINESS'
      ? BUSINESS_READINESS_TIE_BREAK_SENTINEL
      : NON_BUSINESS_READINESS_SENTINEL;
  if (ba !== bb) return ba - bb;

  // 4) CATEGORY_META declaration order as the deterministic fallback.
  return getCategoryMetaIndex(a.category) - getCategoryMetaIndex(b.category);
}

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

/**
 * W1.3: scoring now also drives FCS, which needs id/confidence/tags. The
 * extra fields are optional so legacy callers that only pass category+severity
 * continue to work (FCS will fall back to empty topConcerns / general tags).
 */
export type ScoringFinding = Pick<Finding, 'category' | 'severity'> &
  Partial<Pick<Finding, 'id' | 'confidence' | 'tags'>>;

/**
 * PR-A4 — source-driven inventories that the scoring step consumes to
 * un-N/A categories whose pipeline-step measurement was empty but for which
 * we have alternative evidence:
 *
 *   - PRODUCT_INTENT / REQUIREMENT_COVERAGE → `repoMetadata` (F bucket).
 *     A GitHub description / topics list is enough to lift the category from
 *     'no signal' to 'baseline 100'; security/quality findings still deduct
 *     normally so the score reflects real issues, not just "they wrote a
 *     description".
 *   - FEATURE_GRAPH → `routeInventory` (D bucket). Route count > 0 is the
 *     definitive signal that the project has a UI / API surface.
 *   - DATA_MODEL → `dataModelInventory` (D bucket). Any recognised schema
 *     (Prisma, Firestore today; Drizzle/SQL follow-up) un-N/As the category.
 *
 * Origin attribution flows from which input triggered the un-N/A:
 *   - F-only un-N/A → origin: 'F'
 *   - D-only un-N/A → origin: 'D'
 *   - findings present in the same category → origin: 'mixed'
 *   - N/A still → origin: 'none'
 *
 * Optional + back-compat: callers that omit `inventories` see the previous
 * behaviour unchanged (every test predating PR-A4 stays green).
 */
export interface SourceInventories {
  readonly repoMetadata?: RepoMetadata | null;
  readonly dataModelInventory?: DataModelInventory;
  readonly routeInventory?: RouteInventory;
}

export interface ScoringInput {
  readonly findings: ReadonlyArray<ScoringFinding>;
  readonly coverage?: CoverageInput;
  readonly availableTools?: AvailableTools;
  /** PR-A4 source-driven inventories. See `SourceInventories` doc. */
  readonly inventories?: SourceInventories;
  /**
   * Audit Quality Roadmap §5 (Phase 2) — pre-computed Pattern Library scores
   * per category, supplied by the worker (which runs the deterministic
   * detectors in `patterns/*-patterns.ts` over `state.fileTree` + W1-A
   * markers). A pattern score takes precedence over an inventory baseline for
   * the same category, and like a baseline it only applies to a category that
   * is otherwise N/A for lack of a measuredBy step. Omitting it preserves
   * prior behaviour.
   */
  readonly patternScores?: Partial<
    Record<AuditCategory, { readonly score: number; readonly origin: ScoreOrigin }>
  >;
  /**
   * Pipeline steps that actually executed end-to-end. When supplied, any
   * category whose `measuredBy` lists steps not in this set is reported as
   * N/A — its 100-baseline is not a real measurement (BUG-1).
   * Omitting the field preserves legacy behavior (no extra N/A handling).
   */
  readonly executedSteps?: ReadonlyArray<AuditStep>;
  /**
   * T2.4: optional domain profile (Landing / SaaS / Ecommerce). When supplied,
   * `weightOverrides` are merged on top of `CATEGORY_META.weight` so the
   * weighted overall score reflects the domain's priorities. Omitting it
   * preserves spec-default scoring.
   */
  readonly profile?: AuditProfile | null;
  /**
   * Audit Quality Roadmap §4.1 — external evidence for the 7-Question Launch
   * Gate that the scorer cannot derive itself (file-tree markers from W1-A).
   * The scorer fills in the rest (P0 count, deploy reachability, and the
   * SECURITY_PRIVACY / BUSINESS_READINESS / UX_UI scores) from its own output.
   * When omitted, `launchGate` is not computed and the result field is absent
   * (backward compat for callers/tests predating the gate).
   */
  readonly launchEvidence?: {
    readonly hasReadme: boolean;
    readonly readmeClaimVerified?: boolean | null;
    readonly hasLicense: boolean;
    readonly hasContributing?: boolean;
    readonly hasCiConfig: boolean;
    readonly hasTests: boolean;
  };
}

/**
 * PR-A4-fix — surfaceable inventory signals.
 *
 * The scorer does NOT use these to assign points — that would conflate
 * "data exists" with "quality verified". Instead, the dashboard's
 * strengths panel reads them and renders cards like
 * "✅ GitHub topics 3개 발견 — 다음 단계 LLM 분석의 입력 자료".
 *
 * The presence of each flag is enough — the underlying inventories are
 * still available on the worker `state` for richer "23 pages, 8 APIs"
 * breakdowns when the UI wants to expand.
 */
export interface InventorySignalSummary {
  repoMetadata: boolean;
  dataModel: boolean;
  routes: boolean;
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
  /**
   * W1.3: Founder Confidence Score — single 0~100 metric + (lower, upper)
   * interval + LaunchStatus + up-to-3 top concerns. Sources from the same
   * weighted readinessScore so the dashboard's gauge and verdict never drift.
   */
  fcs: FCSResult;
  /**
   * PR-A4-fix — which inventories carried evidence. Surfaced to the
   * dashboard's strengths panel as positive cards; does NOT contribute to
   * the numeric score (that would conflate existence with quality).
   */
  inventorySignals: InventorySignalSummary;
  /**
   * Audit Quality Roadmap §4.1 — 7-Question Launch Gate verdict. Present only
   * when `launchEvidence` was supplied; absent otherwise (back-compat).
   */
  launchGate?: LaunchGateResult;
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
  // BUG-1: when caller supplies executedSteps, a category whose measuredBy
  // includes any step that did NOT run is treated as N/A. Without this, a
  // skipped step (e.g. ANALYZE_DEPLOY_URL with no deployUrl) silently kept the
  // 100 baseline for UX/UI and inflated readinessScore.
  const executedSet = input.executedSteps ? new Set(input.executedSteps) : null;

  // T2.4: resolve effective per-category weights — profile overrides win over
  // the spec defaults when supplied. Building a base map first keeps the
  // override logic data-only (no branching inside the scoring loop).
  const baseWeights = new Map<AuditCategory, number>(
    CATEGORY_META.map((m) => [m.category, m.weight]),
  );
  const effectiveWeights = applyProfileWeights(baseWeights, input.profile ?? null);

  // PR-A4-fix (2026-05-21) — Inventory signals are EVIDENCE, not scores.
  //
  // The original PR-A4 used `hasInventorySignal` to lift categories out of
  // N/A. That turned out to be wrong: an inventory only proves *existence*
  // ("there's a description on GitHub"), not *quality* ("the description
  // describes the intent well"). With the 100-baseline + finding-deduct
  // model that meant `inventory existence → free 100 points` which the user
  // correctly flagged as misleading.
  //
  // Honest model: keep the category N/A when only inventory data is
  // available, AND surface the inventory facts as positive evidence
  // ("권장사항: GitHub에 3 topics 발견") in the dashboard's strengths panel.
  // The N/A signals "we haven't measured quality yet"; the strength card
  // signals "we found data that the next phase (LLM / Phase 1 tools) will
  // use to actually score this".
  //
  // We pre-compute the signals here so a follow-up step can persist them
  // into `state.inventorySignals` for the UI to consume — but they do NOT
  // touch the score / N/A decision.
  const repoMetadataSignal = hasRepoMetadataSignal(input.inventories?.repoMetadata);
  const dataModelSignal = hasDataModelSignal(input.inventories?.dataModelInventory);
  const routeSignal = hasRouteSignal(input.inventories?.routeInventory);

  // Phase 1.3 (Audit Quality Roadmap §4.3) — deterministic inventory baselines
  // for the structural categories (FEATURE_GRAPH / FUNCTIONAL_FLOW /
  // DATA_MODEL). These lift a category out of N/A *only* when it would
  // otherwise be N/A purely for lack of a measuredBy step AND the file-tree
  // inventory carries structure. See `inventory-scoring.ts` for the
  // reconciliation with PR-A4-fix (modest 50–75 floor, NOT a free 100). When
  // `inventories` is omitted the map is empty → behaviour is unchanged
  // (backward compat: every test predating Phase 1.3 stays green).
  const inventoryBaselines = deriveInventoryBaselines({
    routeInventory: input.inventories?.routeInventory,
    dataModelInventory: input.inventories?.dataModelInventory,
  });

  let weightedSum = 0;
  let totalWeight = 0;
  const categoryScores: CategoryScore[] = [];
  for (const meta of CATEGORY_META) {
    const bucket = perCategory.get(meta.category);
    if (!bucket) continue;
    // Three independent reasons a category may be N/A:
    //   1) no pipeline step produces findings for it (measuredBy empty) →
    //      score=null always, since "100 baseline" carries no signal.
    //   2) zero feature nodes AND it depends on coverage signals
    //      (PRODUCT_INTENT / REQUIREMENT_COVERAGE).
    //   3) caller passed executedSteps AND any measuredBy step did not run.
    const noMeasurement = meta.measuredBy.length === 0;
    const coverageNA = zeroFeatureNodes && COVERAGE_DEPENDENT_CATEGORIES.has(meta.category);
    const measuredButNotRun =
      executedSet !== null &&
      meta.measuredBy.length > 0 &&
      meta.measuredBy.some((s) => !executedSet.has(s));

    // Phase 1.3 (§4.3) + Phase 2 (§5): a structural category that is N/A
    // *purely* because it has no measuredBy step gets lifted to a
    // deterministic score. Precedence: a Phase 2 Pattern Library score (richer)
    // wins over a Phase 1.3 inventory baseline (coarser) for the same category.
    // Coverage-driven or measured-but-not-run N/A is NOT overridden — those are
    // genuine "we could not measure" signals, not "no registry mapping".
    const baseline =
      input.patternScores?.[meta.category] ?? inventoryBaselines.get(meta.category);
    const useBaseline =
      baseline !== undefined && noMeasurement && !coverageNA && !measuredButNotRun;

    const isNA = useBaseline ? false : noMeasurement || coverageNA || measuredButNotRun;
    const weight = effectiveWeights.get(meta.category) ?? meta.weight;

    // The baseline is a FLOOR: findings (should any ever target the category)
    // can only pull the score below it, never above.
    const effectiveScore = useBaseline
      ? Math.min(baseline.score, bucket.score)
      : bucket.score;
    const score = isNA ? null : Math.round(effectiveScore);
    if (!isNA && weight > 0) {
      weightedSum += effectiveScore * weight;
      totalWeight += weight;
    }
    const origin = useBaseline
      ? baseline.origin
      : decideOrigin({
          isNA,
          category: meta.category,
          hasFindings: bucket.hasP0 || bucket.score < 100,
          repoMetadataSignal,
          dataModelSignal,
          routeSignal,
        });
    categoryScores.push({
      category: meta.category,
      score,
      label: meta.label,
      summary: null,
      origin,
    });
  }

  const rawReadiness = totalWeight === 0 ? 0 : weightedSum / totalWeight;
  const readinessScore = Math.round(rawReadiness * confidenceMultiplier);
  const launchStatus = classifyLaunchStatus(
    readinessScore,
    severityCounts.P0,
    confidenceMultiplier,
  );

  // W3.CLN.4: apply deterministic ordering (score desc → weight desc →
  // BUSINESS_READINESS last → declaration order). Sort happens AFTER the
  // weighted average is computed so the math is unaffected; downstream UI
  // (CategoryGrid §C.6) and renderers consume this ordered list directly.
  categoryScores.sort(compareCategoryScoresWithTieBreak);

  // W1.3: FCS reuses the same baseScore + launchStatus so the dashboard's
  // gauge can never drift from the verdict. Confidence/id/tags on a finding
  // are optional in ScoringFinding (back-compat for old call sites that only
  // had category+severity); a HIGH/empty fallback keeps the algorithm pure.
  const fcs = computeFCS({
    baseScore: readinessScore,
    categoryScores,
    findings: input.findings.map((f, i) => ({
      id: f.id ?? `idx-${i}`,
      category: f.category,
      severity: f.severity,
      confidence: (f.confidence ?? 'HIGH') as Confidence,
      tags: f.tags ?? [],
    })),
    baseStatus: launchStatus,
    profileId: input.profile?.id ?? null,
  });

  // Audit Quality Roadmap §4.1 — compute the 7-Question Launch Gate when the
  // caller supplied the external (W1-A file-marker) evidence. The scorer
  // contributes the P0 count, deploy reachability, and the three category
  // scores the gate reads (read off the finalized categoryScores). Omitting
  // `launchEvidence` leaves `launchGate` absent (back-compat).
  let launchGate: LaunchGateResult | undefined;
  if (input.launchEvidence) {
    const scoreOf = (cat: AuditCategory): number | null =>
      categoryScores.find((c) => c.category === cat)?.score ?? null;
    launchGate = evaluateLaunchGate({
      ...input.launchEvidence,
      p0Count: severityCounts.P0,
      deployUrlReachable: coverage?.deployUrlReachable ?? false,
      uxScore: scoreOf('UX_UI'),
      securityScore: scoreOf('SECURITY_PRIVACY'),
      businessScore: scoreOf('BUSINESS_READINESS'),
    });
  }

  // I1: build the result in a single immutable expression rather than the
  // earlier mutate-after-create pattern. Under `exactOptionalPropertyTypes`
  // the previous `if (x !== undefined) result.toolsAvailableRatio = x` form
  // would have to widen the field to `number | undefined`; the spread keeps
  // the property genuinely *absent* when there's no ratio, matching the
  // declared `toolsAvailableRatio?: number` (no explicit `undefined`).
  return {
    readinessScore,
    launchStatus,
    categoryScores,
    severityCounts,
    confidenceMultiplier,
    fcs,
    inventorySignals: {
      repoMetadata: repoMetadataSignal,
      dataModel: dataModelSignal,
      routes: routeSignal,
    },
    ...(toolsAvailableRatio !== undefined ? { toolsAvailableRatio } : {}),
    ...(launchGate ? { launchGate } : {}),
  };
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

/**
 * PR-A4 source-driven inventory signal helpers.
 *
 * Each function returns `true` when the inventory carries enough evidence
 * to lift the matching category out of N/A — i.e. there's *something*
 * source-driven the scoring step can attribute the result to. False means
 * either the inventory was omitted by the caller or it came back empty.
 */
function hasRepoMetadataSignal(rm: RepoMetadata | null | undefined): boolean {
  if (!rm) return false;
  const hasDescription = !!rm.description && rm.description.trim().length > 0;
  const hasTopics = Array.isArray(rm.topics) && rm.topics.length > 0;
  return hasDescription || hasTopics;
}

function hasDataModelSignal(dm: DataModelInventory | undefined): boolean {
  if (!dm) return false;
  return dm.tech !== 'none' && dm.entities.length > 0;
}

function hasRouteSignal(rt: RouteInventory | undefined): boolean {
  if (!rt) return false;
  return rt.routes.length > 0;
}

// The previous PR-A4 had a `categoryHasInventorySignal` helper here that
// mapped each category to its un-N/A inventory bucket. PR-A4-fix removed
// the un-N/A path entirely (inventory existence ≠ quality), so the helper
// is no longer referenced anywhere. Phase B will reintroduce a similar
// mapping but on the LLM-confidence axis — keeping the helper around in
// the meantime would just be dead code (ESLint flags it; rightly so).

/**
 * Origin attribution for a category score. After PR-A4-fix the inventory
 * signals no longer influence the score, so every numeric score is
 * deterministic (D — finding-based or baseline). The L (LLM) bucket is
 * reserved for Phase B; F (Free API) re-enters when the LLM step
 * actually consumes GitHub metadata to score quality (not just existence).
 *
 * Current matrix:
 *   isNA  → 'none'
 *   else  → 'D'  (deterministic findings or "no P1-P3 finding" baseline)
 *
 * The badge surface in the UI stays so PR-B can fill in 'F' / 'L' / 'mixed'
 * without further schema work.
 */
function decideOrigin(args: {
  isNA: boolean;
  category: AuditCategory;
  hasFindings: boolean;
  repoMetadataSignal: boolean;
  dataModelSignal: boolean;
  routeSignal: boolean;
}): ScoreOrigin {
  if (args.isNA) return 'none';
  // Silence unused-param warnings — kept in the signature for PR-B re-use.
  void args.category;
  void args.hasFindings;
  void args.repoMetadataSignal;
  void args.dataModelSignal;
  void args.routeSignal;
  return 'D';
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
