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
import { CoverageMatrixEntrySchema } from './coverage-matrix.js';

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

// LaunchStatus is referenced both by AuditReportSchema (final verdict) and by
// AuditRunSchema.launchStatus (guardrail short-circuit path — T1.1d), so it is
// declared up here before AuditRunSchema.
export const LaunchStatus = z.enum([
  'READY',
  'CONDITIONAL',
  'NEEDS_WORK',
  'AT_RISK',
  'NOT_READY',
  // INDETERMINATE: coverage signal too low to assert a launch verdict.
  // Distinct from NOT_READY (which is a confident negative).
  'INDETERMINATE',
  // BLOCKED: audit aborted by a guardrail (e.g. repo too large, daily quota
  // exhausted) before measurement could meaningfully start. Distinct from
  // INDETERMINATE (which means tools ran but coverage was thin).
  'BLOCKED',
]);
export type LaunchStatus = z.infer<typeof LaunchStatus>;

export const LAUNCH_STATUS_LABELS_KO: Record<LaunchStatus, string> = {
  READY: '출시 준비 양호',
  CONDITIONAL: '조건부 출시 가능',
  NEEDS_WORK: '출시 전 보완 필요',
  AT_RISK: '위험',
  NOT_READY: '출시 부적합',
  INDETERMINATE: '판단 불가 (분석 자료 부족)',
  BLOCKED: '감사 중단 (가드레일 작동)',
};

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
  // T1.1d: guardrail short-circuit metadata. When the worker calls
  // `markRunBlocked` (e.g. REPO_TOO_LARGE), it stamps `launchStatus='BLOCKED'`
  // plus a machine-readable `abortReason` directly on the AuditRun doc — no
  // report doc is produced under this path, so the dashboard reads these from
  // here to render the BLOCKED chip + 가드레일 banner. Optional for
  // forward/backward-compat with legacy / non-blocked runs.
  launchStatus: LaunchStatus.optional(),
  abortReason: z.string().optional(),
  // T2.5: when this run is a re-audit of the same repo, this points at the
  // immediately-preceding COMPLETED run for `(ownerId, repoUrl)`. Optional
  // for forward-compat: legacy AuditRun docs written before the field
  // existed will be missing it; the auditRunConverter normalises missing
  // keys to `undefined` so callers can branch on its presence.
  previousRunId: z.string().optional(),
  // T2.4: domain audit profile id selected by the user at audit start
  // (e.g. 'landing' | 'saas' | 'ecommerce'). The worker passes this string
  // through to `getProfile` from audit-core, which returns null for unknown
  // / missing ids → spec-default scoring. Kept as a free string here (not a
  // zod enum) so adding a new profile in audit-core doesn't require a
  // shared-types release.
  profileId: z.string().optional(),
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
// ActionHint (L-P0-6) — non-developer-friendly "다음 행동" 한 줄 + 예상 소요
// 시간. Sprint 3 Appendix D dictionary 가 ruleFamily → ActionHint 매핑 SSOT;
// finding 단위로 attach 되어 리포트 §3 "Blocker Spotlight" 와 finding-card 의
// "다음 행동" 라인을 렌더한다. 200자 cap 은 한 줄 UI 보장.
// ---------------------------------------------------------------------------

// Spec 명칭: `ActionHintEtaSchema` (lead 의 L-P0-6 spec 그대로). 5/30/60/240
// 분 ladder 외의 값은 reject. Appendix D dictionary 가 ruleFamily 별로 이
// 네 가지 중 하나를 SSOT 로 선택한다.
export const ActionHintEtaSchema = z.union([
  z.literal(5),
  z.literal(30),
  z.literal(60),
  z.literal(240),
]);
export type ActionHintEta = z.infer<typeof ActionHintEtaSchema>;

// `.strict()` 으로 unknown field 거부 — dictionary export 가 schema 와
// drift 되면 schema-level 에서 즉시 fail-fast.
export const ActionHintSchema = z
  .object({
    text: z.string().min(1).max(200),
    etaMinutes: ActionHintEtaSchema,
    referenceUrl: z.string().url().optional(),
  })
  .strict();
export type ActionHint = z.infer<typeof ActionHintSchema>;

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
  // L-P0-6: optional 다음 행동 hint. Optional 로 두는 이유는 (1) Appendix D
  // dictionary 미적용 finding 은 hint 가 비어있을 수 있고, (2) 기존 Firestore
  // 문서/스냅숏 fixture 의 forward-compat 를 깨지 않기 위함.
  actionHint: ActionHintSchema.optional(),
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

// LaunchStatus + LAUNCH_STATUS_LABELS_KO are declared near AuditRunSchema
// (above) because AuditRunSchema.launchStatus references the same enum.

// ---------------------------------------------------------------------------
// ShipVerdict (L-P0-6 / L-P0-3) — 리포트 §1 "한 줄 결론" 의 정형 자료형.
// finalize-launch-2026-05-18.md §3.2.1 의 4단 verdict + reason/score/
// topBlockers/confidence 를 그대로 따른다. AuditReport.launchStatus 와
// 별개로 존재하는 이유는 (1) 비개발자도 즉시 이해 가능한 verdict label,
// (2) 가장 위험한 finding 3건을 "왜 이 결론인가" 의 근거로 함께 보여주기
// 위함. topBlockers 는 max 3 으로 capped — 의도적으로 작게.
// ---------------------------------------------------------------------------

// Spec 명칭: `ShipVerdictLevelSchema` (lead 의 L-P0-6 spec 그대로).
// LaunchStatus 7단과 의도적으로 다른 4단 — §3.2.1 "한 줄 결론" 의
// 비개발자 친화 verdict. L-P0-3 generator 가 LaunchStatus → ShipVerdictLevel
// 매핑 규칙을 정의한다.
export const ShipVerdictLevelSchema = z.enum([
  'READY',
  'READY_WITH_CAVEATS',
  'NEEDS_WORK',
  'BLOCKED',
]);
export type ShipVerdictLevel = z.infer<typeof ShipVerdictLevelSchema>;

// topBlockerIds 는 finding.id 참조만 들고 실체는 findings 배열에서 조회.
// 의도: (1) Firestore doc 크기 cap (1MB) 안전, (2) finding 본문이 별도
// 수정될 때 verdict 가 stale snapshot 을 들고 있지 않도록.
// `.strict()` 으로 unknown field 거부.
export const ShipVerdictSchema = z
  .object({
    verdict: ShipVerdictLevelSchema,
    reason: z.string().min(1).max(300),
    score: z.number().int().min(0).max(100),
    topBlockerIds: z.array(z.string()).max(3),
    confidence: Confidence,
  })
  .strict();
export type ShipVerdict = z.infer<typeof ShipVerdictSchema>;

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
  // L-P0-6 / L-P0-3: 리포트 §1 한 줄 결론. 기존 리포트 forward-compat 를
  //위해 optional. Sprint 3 의 ship-verdict-generator (L-P0-3) 가 step18
  // GENERATE_REPORT 단계에서 채운다.
  shipVerdict: ShipVerdictSchema.optional(),
  // L-P0-6 / L-P0-5: PRD Coverage Matrix entries. PRD 미업로드 / claim 0건
  // 인 run 에서는 `undefined` 로 두어 §C.6 edge case 정책에 따라 리포트 §2
  // 섹션 자체를 생략한다.
  coverageMatrix: z.array(CoverageMatrixEntrySchema).optional(),
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
