import { z } from 'zod';
import {
  AuditCategory,
  AuditRunStatus,
  Confidence,
  EvidenceType,
  FeatureEdgeType,
  FeatureNodeType,
  FindingStatus,
  ImplementationStatus,
  Severity,
} from './enums.js';
import { AuditStepSchema } from './audit-steps.js';

/**
 * Firestore Timestamp ISO string. We standardize on ISO 8601 strings at the
 * API boundary; serverTimestamp() values are converted at the converter layer.
 */
export const IsoDateString = z.string().datetime({ offset: true });

// ---------------------------------------------------------------------------
// User & Project
// ---------------------------------------------------------------------------

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email().nullable(),
  name: z.string().nullable(),
  createdAt: IsoDateString,
});
export type User = z.infer<typeof UserSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  name: z.string().nullable(),
  repoUrl: z.string().url(),
  deployUrl: z.string().url().nullable(),
  repoOwner: z.string().nullable(),
  repoName: z.string().nullable(),
  defaultBranch: z.string().nullable(),
  createdAt: IsoDateString,
  updatedAt: IsoDateString,
});
export type Project = z.infer<typeof ProjectSchema>;

// ---------------------------------------------------------------------------
// AuditRun
// ---------------------------------------------------------------------------

/**
 * Identifies which enqueue path produced the Cloud Task. Mirrors the runtime
 * `EnqueueMode` returned by `enqueueAuditTask` so the run document can record
 * which dispatch route was taken:
 *   - 'cloud-tasks'   : real GCP Cloud Tasks createTask (or dedupe success)
 *   - 'direct-worker' : dev/emulator awaited POST straight to the worker
 *   - 'stub'          : no env configured — best-effort log only, no dispatch
 * Single source of truth lives here so the persisted shape and the runtime
 * helper cannot drift apart.
 */
export const EnqueueModeSchema = z.enum(['cloud-tasks', 'direct-worker', 'stub']);
export type EnqueueMode = z.infer<typeof EnqueueModeSchema>;

export const AuditRunSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  ownerId: z.string(),
  status: AuditRunStatus,
  currentStep: AuditStepSchema.nullable(),
  progress: z.number().int().min(0).max(100),
  commitHash: z.string().nullable(),
  startedAt: IsoDateString.nullable(),
  completedAt: IsoDateString.nullable(),
  errorMessage: z.string().nullable(),
  // Echoed input for worker / display.
  repoUrl: z.string().url(),
  deployUrl: z.string().url().nullable(),
  prdText: z.string().nullable(),
  // Tracks which Cloud Tasks dispatch route handled this run. Null until the
  // enqueue helper resolves; set on the post-commit update in create-audit-run.
  // Optional for forward-compat: legacy documents written before this field
  // existed will have the key missing — the Firestore converter normalizes
  // missing/undefined to null at the read boundary.
  enqueueMode: EnqueueModeSchema.nullable().optional(),
  // Names of analysis tools (e.g. 'semgrep', 'osv-scanner', 'lighthouse',
  // 'playwright') that recorded `ToolResult.status === 'SKIPPED'` during this
  // run — typically because the binary was absent on the worker host. The UI
  // surfaces this as a "partial results" banner so the demo audience knows the
  // score is degraded, not anomalously perfect. Optional / defaulted to []
  // for forward-compat with legacy documents written before the field
  // existed; the Firestore converter normalises missing values to `[]`.
  partialResultTools: z.array(z.string()).optional().default([]),
  createdAt: IsoDateString,
  updatedAt: IsoDateString,
});
export type AuditRun = z.infer<typeof AuditRunSchema>;

// ---------------------------------------------------------------------------
// ProgressEvent
// ---------------------------------------------------------------------------

export const ProgressEventSchema = z.object({
  id: z.string(),
  runId: z.string(),
  step: AuditStepSchema,
  percent: z.number().int().min(0).max(100),
  message: z.string(),
  ts: IsoDateString,
});
export type ProgressEvent = z.infer<typeof ProgressEventSchema>;

// ---------------------------------------------------------------------------
// Finding
// ---------------------------------------------------------------------------

export const FindingSchema = z.object({
  id: z.string(),
  auditRunId: z.string(),
  title: z.string().min(1),
  category: AuditCategory,
  severity: Severity,
  confidence: Confidence,
  status: FindingStatus,
  summary: z.string(),
  nonDeveloperExplanation: z.string().nullable(),
  technicalExplanation: z.string().nullable(),
  impact: z.string().nullable(),
  recommendation: z.string().nullable(),
  acceptanceCriteria: z.array(z.string()),
  tags: z.array(z.string()),
  evidenceCount: z.number().int().min(0).default(0),
  createdAt: IsoDateString,
});
export type Finding = z.infer<typeof FindingSchema>;

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export const EvidenceSchema = z.object({
  id: z.string(),
  auditRunId: z.string(),
  findingId: z.string().nullable(),
  type: EvidenceType,
  source: z.string(),
  path: z.string().nullable(),
  lineStart: z.number().int().nullable(),
  lineEnd: z.number().int().nullable(),
  url: z.string().url().nullable(),
  selector: z.string().nullable(),
  screenshotPath: z.string().nullable(),
  snippet: z.string().nullable(),
  maskedValue: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: IsoDateString,
});
export type Evidence = z.infer<typeof EvidenceSchema>;

// ---------------------------------------------------------------------------
// FeatureGraph
// ---------------------------------------------------------------------------

export const FeatureNodeSchema = z.object({
  id: z.string(),
  type: FeatureNodeType,
  label: z.string(),
  status: ImplementationStatus,
  risk: Severity.nullable(),
  confidence: Confidence,
  summary: z.string().nullable(),
  // Loose evidence pointers used by the UI.
  evidenceIds: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});
export type FeatureNode = z.infer<typeof FeatureNodeSchema>;

export const FeatureEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: FeatureEdgeType,
  status: ImplementationStatus,
  summary: z.string().nullable(),
});
export type FeatureEdge = z.infer<typeof FeatureEdgeSchema>;

export const FeatureGraphSchema = z.object({
  id: z.literal('main'),
  auditRunId: z.string(),
  nodes: z.array(FeatureNodeSchema),
  edges: z.array(FeatureEdgeSchema),
  summary: z.string().nullable(),
  createdAt: IsoDateString,
  updatedAt: IsoDateString,
});
export type FeatureGraph = z.infer<typeof FeatureGraphSchema>;

// ---------------------------------------------------------------------------
// AuditReport
// ---------------------------------------------------------------------------

export const CategoryScoreSchema = z.object({
  category: AuditCategory,
  // null = N/A (coverage signal could not score this category — surfaced as
  // '판단 불가' in the UI, excluded from the weighted overall).
  score: z.number().min(0).max(100).nullable(),
  label: z.string(),
  summary: z.string().nullable(),
});
export type CategoryScore = z.infer<typeof CategoryScoreSchema>;

export const LaunchStatus = z.enum([
  'READY',
  'CONDITIONAL',
  'NEEDS_WORK',
  'AT_RISK',
  'NOT_READY',
  // INDETERMINATE: coverage signal too low to assert a launch verdict.
  // Distinct from NOT_READY (which is a confident negative).
  'INDETERMINATE',
]);
export type LaunchStatus = z.infer<typeof LaunchStatus>;

export const LAUNCH_STATUS_LABELS_KO: Record<LaunchStatus, string> = {
  READY: '출시 준비 양호',
  CONDITIONAL: '조건부 출시 가능',
  NEEDS_WORK: '출시 전 보완 필요',
  AT_RISK: '위험',
  NOT_READY: '출시 부적합',
  INDETERMINATE: '판단 불가 (분석 자료 부족)',
};

export const AuditReportSchema = z.object({
  id: z.literal('main'),
  auditRunId: z.string(),
  readinessScore: z.number().int().min(0).max(100),
  launchStatus: LaunchStatus,
  categoryScores: z.array(CategoryScoreSchema),
  severityCounts: z.object({
    P0: z.number().int().min(0),
    P1: z.number().int().min(0),
    P2: z.number().int().min(0),
    P3: z.number().int().min(0),
  }),
  executiveSummary: z.string(),
  markdown: z.string(),
  createdAt: IsoDateString,
  updatedAt: IsoDateString,
});
export type AuditReport = z.infer<typeof AuditReportSchema>;

// ---------------------------------------------------------------------------
// ImprovementPRD
// ---------------------------------------------------------------------------

export const ImprovementPrdSchema = z.object({
  id: z.literal('main'),
  auditRunId: z.string(),
  title: z.string(),
  markdown: z.string(),
  epicCount: z.number().int().min(0),
  createdAt: IsoDateString,
  updatedAt: IsoDateString,
});
export type ImprovementPRD = z.infer<typeof ImprovementPrdSchema>;

// ---------------------------------------------------------------------------
// ToolResult
// ---------------------------------------------------------------------------

export const ToolResultSchema = z.object({
  id: z.string(),
  auditRunId: z.string(),
  toolName: z.string(),
  toolVersion: z.string().nullable(),
  status: z.enum(['SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED']),
  rawSummary: z.record(z.unknown()).nullable(),
  artifactPath: z.string().nullable(),
  createdAt: IsoDateString,
});
export type ToolResult = z.infer<typeof ToolResultSchema>;

// ---------------------------------------------------------------------------
// UploadedDocument
// ---------------------------------------------------------------------------

export const UploadedDocumentSchema = z.object({
  id: z.string(),
  auditRunId: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  extractedTextRef: z.string().nullable(),
  createdAt: IsoDateString,
});
export type UploadedDocument = z.infer<typeof UploadedDocumentSchema>;
