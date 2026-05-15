// Step registry + the Step interface shared by all 15 pipeline steps.
//
// The orchestrator (`runner.ts`) iterates over AUDIT_STEPS in declared order,
// finds the matching Step, and invokes execute(ctx, state). Steps may write to
// `state` to share data across the pipeline (e.g., detected features feed into
// graph generation).

import type { AuditStep } from '@cleartoship/shared-types';
import type { WorkerCtx, NormalizedFinding } from '../../adapters/index.js';

export interface PipelineState {
  /** GitHub metadata fetched in step 2. */
  repoMetadata: {
    defaultBranch: string;
    description: string | null;
    sizeKb: number;
    primaryLanguage: string | null;
    pushedAt: string | null;
  } | null;
  /** File tree (mock in Sprint 0). */
  fileTree: string[];
  /** Tech stack guesses. */
  techStack: string[];
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
  /** Severity counts (filled by CALCULATE_SCORES). */
  severityCounts: { P0: number; P1: number; P2: number; P3: number };
  /** Resolved persistent ids of findings written to Firestore. */
  persistedFindingIds: string[];
  readinessScore: number;
  launchStatus: 'READY' | 'CONDITIONAL' | 'NEEDS_WORK' | 'AT_RISK' | 'NOT_READY';
}

export interface Step {
  /** Maps 1:1 to `AUDIT_STEPS` from shared-types. */
  step: AuditStep;
  execute(ctx: WorkerCtx, state: PipelineState): Promise<void>;
}

export function createInitialState(): PipelineState {
  return {
    repoMetadata: null,
    fileTree: [],
    techStack: [],
    detectedFeatures: [],
    pendingFindings: [],
    severityCounts: { P0: 0, P1: 0, P2: 0, P3: 0 },
    persistedFindingIds: [],
    readinessScore: 0,
    launchStatus: 'NOT_READY',
  };
}

// Steps register themselves in the array exported below. Order matters.
// Imports are lazy via getRegistry() to allow circular references.
import { step01ValidateInput } from './01-validate-input.js';
import { step02FetchRepoMetadata } from './02-fetch-repo-metadata.js';
import { step03CloneRepo } from './03-clone-repo.js';
import { step04AnalyzeProjectStructure } from './04-analyze-project-structure.js';
import { step05DetectFeatures } from './05-detect-features.js';
import { step06StaticAnalysis } from './06-static-analysis.js';
import { step07DependencyScan } from './07-dependency-scan.js';
import { step08SecretScan } from './08-secret-scan.js';
import { step09AnalyzeDeployUrl } from './09-analyze-deploy-url.js';
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
  step05DetectFeatures,
  step06StaticAnalysis,
  step07DependencyScan,
  step08SecretScan,
  step09AnalyzeDeployUrl,
  step10GenerateFeatureGraph,
  step11MapChecklist,
  step12CalculateScores,
  step13GenerateReport,
  step14GenerateImprovementPrd,
  step15Cleanup,
];
