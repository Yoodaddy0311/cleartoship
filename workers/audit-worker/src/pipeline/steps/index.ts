// Step registry + the Step interface shared by all 20 pipeline steps.
//
// The orchestrator (`runner.ts`) iterates over AUDIT_STEPS in declared order,
// finds the matching Step, and invokes execute(ctx, state). Steps may write to
// `state` to share data across the pipeline (e.g., detected features feed into
// graph generation).

import type {
  AuditStep,
  CategoryScore,
  CoverageMatrixEntry,
  DataModelInventory,
  RepoMetadata,
} from '@cleartoship/shared-types';
import { EMPTY_DATA_MODEL_INVENTORY } from '@cleartoship/shared-types';
import type {
  AuditEvidence,
  BusinessEvidence,
  PrdAnalysis,
  RiskyFunction,
  W1AEvidence,
} from '@cleartoship/audit-core';
import { createEmptyEvidence, EMPTY_BUSINESS_EVIDENCE } from '@cleartoship/audit-core';

const EMPTY_W1A_EVIDENCE: W1AEvidence = {
  README_PRESENT: false,
  PACKAGE_SCRIPTS_PRESENT: false,
  LICENSE_PRESENT: false,
  CI_CONFIG_PRESENT: false,
  TESTS_DIR_PRESENT: false,
};
import type { WorkerCtx, NormalizedFinding } from '../../adapters/index.js';
import type { FrameworkProfile } from '../framework-profile.js';

export interface PipelineState {
  /**
   * GitHub metadata fetched in step 2. PR-A1 expanded this from a 5-field
   * inline shape to the full `RepoMetadata` (PRD source-driven-extraction
   * §3.1) — topics, languages bytes, stars/forks, license, latest release,
   * authenticated flag. Same `null` semantics: step 02 either populates
   * it or throws.
   */
  repoMetadata: RepoMetadata | null;
  /**
   * Stack-agnostic data model snapshot built by step 16 (PR-A2 / PRD §3.4).
   * Always populated (no null) — `EMPTY_DATA_MODEL_INVENTORY` (tech='none')
   * for repos without a recognised schema. Downstream scoring uses this to
   * stop returning N/A for the 데이터 모델 category on non-Prisma stacks.
   */
  dataModelInventory: DataModelInventory;
  /** Cloned repo's file tree, populated by step03-clone-repo. */
  fileTree: string[];
  /** Tech stack guesses (flat label list — drives the report header). */
  techStack: string[];
  /** Detailed framework detection result (filled by step04). */
  frameworkProfile: FrameworkProfile | null;
  /** Detected feature primitives (pages, APIs, models). */
  detectedFeatures: Array<{
    id: string;
    type:
      | 'product_area'
      | 'feature'
      | 'page'
      | 'component'
      | 'action'
      | 'api'
      | 'data_model'
      | 'external_service'
      | 'auth_guard'
      | 'state'
      | 'recommended_feature';
    label: string;
    status:
      | 'complete'
      | 'partial'
      | 'ui_only'
      | 'logic_only'
      | 'missing_connection'
      | 'missing'
      | 'risky'
      | 'recommended'
      | 'unknown';
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    summary: string | null;
    edges?: Array<{ target: string; type: 'contains' | 'renders' | 'navigates_to' | 'triggers' | 'calls_api' | 'reads_from' | 'writes_to' | 'requires_auth' | 'depends_on' | 'missing_link' | 'recommended_connection' }>;
  }>;
  /** Findings produced by analysis steps (persisted in MAP_CHECKLIST). */
  pendingFindings: NormalizedFinding[];
  /** Risky function candidates discovered by step18 (pre-LLM verification). */
  riskyFunctions: RiskyFunction[];
  /** Severity counts (filled by CALCULATE_SCORES). */
  severityCounts: { P0: number; P1: number; P2: number; P3: number };
  /** Resolved persistent ids of findings written to Firestore. */
  persistedFindingIds: string[];
  readinessScore: number;
  launchStatus: 'READY' | 'CONDITIONAL' | 'NEEDS_WORK' | 'AT_RISK' | 'NOT_READY' | 'INDETERMINATE' | 'BLOCKED';
  /**
   * Steps whose primary work actually ran end-to-end (BUG-1). Drives the
   * scorer's "measuredBy step missing → category N/A" rule. A step that
   * early-returned because a precondition was missing (e.g. no deployUrl,
   * required tool not installed) must NOT push itself.
   */
  executedSteps: AuditStep[];
  /**
   * Machine-readable abort reason when a guardrail short-circuits the pipeline
   * (T1.1 cost guardrails). Examples: 'REPO_TOO_LARGE', 'DAILY_QUOTA_EXCEEDED'.
   * Null means no guardrail tripped. When non-null, `launchStatus` must be
   * 'BLOCKED' and the runner should skip remaining steps.
   */
  abortReason: string | null;
  /**
   * Audit evidence keys collected during the pipeline (T1.2). A key is set to
   * `true`/`false` once the responsible step inspected the clone; an unset key
   * resolves to INDETERMINATE in the checklist evaluator. PoC scope: step04
   * emits `README_PRESENT`.
   */
  evidence: AuditEvidence;
  /**
   * W1-A launch-readiness evidence (T1.2-FU). Strict record (all 5 keys
   * present, default false). step04 fills every key by inspecting the clone;
   * step11 calls `buildW1AFindings(state.w1aEvidence)` to convert FAIL items
   * into pending P2 findings before they are persisted.
   */
  w1aEvidence: W1AEvidence;
  /**
   * PRD claim analysis (T2.1 / W2-C). null until step04c runs. Populated by
   * scanning README, CHANGELOG, docs/PRD files, and package.json for stage keywords
   * (MVP / Alpha / Beta / Production). step11 calls
   * `buildClaimMismatchFindings(state.prdAnalysis, signals)` to flag claims
   * that don't match the measured launch-readiness signals.
   */
  prdAnalysis: PrdAnalysis | null;
  /**
   * Per-category scores produced by CALCULATE_SCORES (step12) and consumed by
   * GENERATE_REPORT (step13). Previously smuggled through
   * `(state as unknown as { __categoryScores })` — promoted to a typed channel
   * so the producer/consumer share a checked contract (I2). Null until step12
   * runs; readers treat null as "no scores computed yet".
   */
  categoryScores: CategoryScore[] | null;
  /**
   * Business readiness evidence (T2.8 / UPG-06 / W2-BR). Strict record (all 5
   * keys present, default false). step13b fills the keys it can detect (Legal
   * + Analytics in Phase 1); the rest fall through as false so the checklist
   * still emits "not yet measured" findings instead of silently dropping a
   * sub-category. step11 calls `buildBusinessReadinessFindings(state.businessEvidence)`
   * to convert FAIL items into pending P1 findings.
   */
  businessEvidence: BusinessEvidence;
  /**
   * L-P0-5 (USP-2) — PRD Coverage Matrix entries. Populated by step13 right
   * before GENERATE_REPORT once `detectedFeatures` + `pendingFindings` are
   * stable; null until then. Empty array means "PRD uploaded but 0 claims
   * extracted" (§C.6) — the renderer still omits the §2.1 section in that case.
   */
  prdCoverageMatrix: CoverageMatrixEntry[] | null;
}

export interface Step {
  /** Maps 1:1 to `AUDIT_STEPS` from shared-types. */
  step: AuditStep;
  execute(ctx: WorkerCtx, state: PipelineState): Promise<void>;
}

export function createInitialState(): PipelineState {
  return {
    repoMetadata: null,
    dataModelInventory: EMPTY_DATA_MODEL_INVENTORY,
    fileTree: [],
    techStack: [],
    frameworkProfile: null,
    detectedFeatures: [],
    pendingFindings: [],
    riskyFunctions: [],
    severityCounts: { P0: 0, P1: 0, P2: 0, P3: 0 },
    persistedFindingIds: [],
    readinessScore: 0,
    launchStatus: 'NOT_READY',
    executedSteps: [],
    abortReason: null,
    evidence: createEmptyEvidence(),
    w1aEvidence: { ...EMPTY_W1A_EVIDENCE },
    prdAnalysis: null,
    categoryScores: null,
    businessEvidence: { ...EMPTY_BUSINESS_EVIDENCE },
    prdCoverageMatrix: null,
  };
}

// Steps register themselves in the array exported below. Order matters.
// Imports are lazy via getRegistry() to allow circular references.
import { step01ValidateInput } from './01-validate-input.js';
import { step02FetchRepoMetadata } from './02-fetch-repo-metadata.js';
import { step03CloneRepo } from './03-clone-repo.js';
import { step04AnalyzeProjectStructure } from './04-analyze-project-structure.js';
import { step04cAnalyzePrd } from './04c-analyze-prd.js';
import { step05DetectFeatures } from './05-detect-features.js';
import { step06StaticAnalysis } from './06-static-analysis.js';
import { step18DiscoverRiskyFunctions } from './18-discover-risky-functions.js';
import { step07DependencyScan } from './07-dependency-scan.js';
import { step08SecretScan } from './08-secret-scan.js';
import { step16AnalyzeDataModel } from './16-analyze-data-model.js';
import { step09AnalyzeDeployUrl } from './09-analyze-deploy-url.js';
import { step17DesignConsistency } from './17-design-consistency.js';
import { step13bAnalyzeBusinessReadiness } from './13b-analyze-business-readiness.js';
import { step10GenerateFeatureGraph } from './10-generate-feature-graph.js';
import { step11MapChecklist } from './11-map-checklist.js';
import { step12CalculateScores } from './12-calculate-scores.js';
import { step13GenerateReport } from './13-generate-report.js';
import { step14GenerateImprovementPrd } from './14-generate-improvement-prd.js';
import { step15Cleanup } from './15-cleanup.js';

export const STEP_REGISTRY: ReadonlyArray<Step> = [
  step01ValidateInput,
  step02FetchRepoMetadata,
  step03CloneRepo,
  step04AnalyzeProjectStructure,
  step04cAnalyzePrd,
  step05DetectFeatures,
  step06StaticAnalysis,
  step18DiscoverRiskyFunctions,
  step07DependencyScan,
  step08SecretScan,
  step16AnalyzeDataModel,
  step09AnalyzeDeployUrl,
  step17DesignConsistency,
  step13bAnalyzeBusinessReadiness,
  step10GenerateFeatureGraph,
  step11MapChecklist,
  step12CalculateScores,
  step13GenerateReport,
  step14GenerateImprovementPrd,
  step15Cleanup,
];
