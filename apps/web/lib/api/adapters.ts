/**
 * Adapters between API DTOs (shared-types Firestore-aligned shapes) and the
 * UI view-model shapes. Keeping these as a thin mapping layer lets us swap
 * fixture → live data without touching dozens of downstream components.
 */
import type {
  AuditReport,
  Evidence,
  FeatureEdge,
  FeatureGraph,
  FeatureNode,
  Finding,
  LaunchStatus as ApiLaunchStatus,
  Confidence as ApiConfidence,
  ScoreOrigin,
} from '@cleartoship/shared-types';
import type { LaunchStatus as UiLaunchStatus } from '@/lib/format/status';
import type { AuditCategory } from '@/lib/format/category';
import type { Severity } from '@/lib/format/severity';
import type { MockEdge, MockNode } from '@/lib/mock/audit-fixture';
import type {
  FindingEvidenceView,
  FindingViewModel,
} from '@/lib/types/finding-view';

const LAUNCH_STATUS_MAP: Record<ApiLaunchStatus, UiLaunchStatus> = {
  READY: 'ready',
  CONDITIONAL: 'ready_with_improvements',
  NEEDS_WORK: 'needs_work',
  AT_RISK: 'needs_work',
  NOT_READY: 'stop',
  // Worker scoring sets INDETERMINATE when coverage is too low to trust the
  // score; UI surfaces an inline "분석 표면 부족" banner instead of a verdict
  // chip — see ScoreOverview.
  INDETERMINATE: 'indeterminate',
  // T1.1 guardrails (e.g. REPO_TOO_LARGE) abort the audit before measurement
  // can meaningfully start. Worker writes BLOCKED + abortReason — UI shows a
  // "가드레일 작동" banner and the BLOCKED chip alongside the reason code.
  BLOCKED: 'blocked',
};

export function adaptLaunchStatus(s: ApiLaunchStatus): UiLaunchStatus {
  return LAUNCH_STATUS_MAP[s];
}

const CONFIDENCE_MAP: Record<ApiConfidence, FindingViewModel['confidence']> = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

/** Categorize the 12 shared categories down to the 11 the UI renders. */
function isUiCategory(c: Finding['category']): c is AuditCategory {
  return c !== 'MAINTAINABILITY_DOCUMENTATION';
}

/** API category scores arrive as a list; UI components expect a record. */
export function adaptCategoryScores(
  list: AuditReport['categoryScores']
): Record<AuditCategory, number> {
  const initial: Record<AuditCategory, number> = {
    PRODUCT_INTENT: 0,
    REQUIREMENT_COVERAGE: 0,
    FEATURE_GRAPH: 0,
    FUNCTIONAL_FLOW: 0,
    UX_UI: 0,
    FRONTEND_CODE: 0,
    BACKEND_API: 0,
    DATA_MODEL: 0,
    SECURITY_PRIVACY: 0,
    LAUNCH_READINESS: 0,
    BUSINESS_READINESS: 0,
  };
  for (const cs of list) {
    if (isUiCategory(cs.category)) {
      // null = N/A from coverage signal; treat as 0 in the legacy numeric
      // record. UI surfaces 'INDETERMINATE' separately via launchStatus.
      initial[cs.category] = cs.score === null ? 0 : Math.round(cs.score);
    }
  }
  return initial;
}

/**
 * Preserves `null` (= N/A from the coverage signal) so the dashboard's
 * CategoryGrid can render "N/A" tiles instead of falsely reporting "0점".
 * Categories not present in the API list default to `null` (unscored).
 */
export function adaptCategoryScoresNullable(
  list: AuditReport['categoryScores']
): Record<AuditCategory, number | null> {
  const initial: Record<AuditCategory, number | null> = {
    PRODUCT_INTENT: null,
    REQUIREMENT_COVERAGE: null,
    FEATURE_GRAPH: null,
    FUNCTIONAL_FLOW: null,
    UX_UI: null,
    FRONTEND_CODE: null,
    BACKEND_API: null,
    DATA_MODEL: null,
    SECURITY_PRIVACY: null,
    LAUNCH_READINESS: null,
    BUSINESS_READINESS: null,
  };
  for (const cs of list) {
    if (isUiCategory(cs.category)) {
      initial[cs.category] = cs.score === null ? null : Math.round(cs.score);
    }
  }
  return initial;
}

/**
 * PR-A4 — extract per-category score origin (D/F/L/mixed/none) from the
 * scored report so the CategoryGrid can render origin badges. Returns a
 * `Partial` map because old audit runs persisted without the field; the
 * UI treats absent values as `none` (no badge).
 */
export function adaptCategoryScoreOrigins(
  list: AuditReport['categoryScores']
): Partial<Record<AuditCategory, ScoreOrigin>> {
  const out: Partial<Record<AuditCategory, ScoreOrigin>> = {};
  for (const cs of list) {
    if (!isUiCategory(cs.category)) continue;
    if (cs.origin) out[cs.category] = cs.origin;
  }
  return out;
}

function splitBulletList(input: string | null): string[] {
  if (!input) return [];
  return input
    .split(/\r?\n+/)
    .map((line) => line.replace(/^[\s•\-\*\d.)]+/, '').trim())
    .filter((line) => line.length > 0);
}

export function adaptFinding(
  finding: Finding,
  evidences: Evidence[] = []
): FindingViewModel {
  const category: AuditCategory = isUiCategory(finding.category)
    ? finding.category
    : 'LAUNCH_READINESS';
  return {
    id: finding.id,
    title: finding.title,
    category,
    severity: finding.severity as Severity,
    confidence: CONFIDENCE_MAP[finding.confidence],
    summary: finding.summary,
    nonDeveloperExplanation: finding.nonDeveloperExplanation ?? '',
    technicalExplanation: finding.technicalExplanation ?? '',
    impact: splitBulletList(finding.impact),
    recommendation: splitBulletList(finding.recommendation),
    acceptanceCriteria: finding.acceptanceCriteria,
    evidences: evidences.map(adaptEvidence),
    // L-P0-6: forward optional `actionHint` straight through — schema 가 이미
    // strict-validated 이고 view shape 도 같은 ladder 를 쓴다 (5/30/60/240).
    ...(finding.actionHint ? { actionHint: finding.actionHint } : {}),
  };
}

export function adaptEvidence(e: Evidence): FindingEvidenceView {
  const evidence: FindingEvidenceView = {
    id: e.id,
    maskedSecret: e.maskedValue !== null,
  };
  if (e.path !== null) evidence.filePath = e.path;
  if (e.lineStart !== null) evidence.lineStart = e.lineStart;
  if (e.lineEnd !== null) evidence.lineEnd = e.lineEnd;
  if (e.url !== null) evidence.url = e.url;
  if (e.selector !== null) evidence.selector = e.selector;
  if (e.snippet !== null) evidence.snippet = e.snippet;
  return evidence;
}

/**
 * Feature graph nodes have no persisted layout — synthesize a deterministic
 * grid so the ReactFlow canvas can render. Worker will populate positions in
 * a later sprint.
 */
function layoutNodes(nodes: FeatureNode[]): Map<string, { x: number; y: number }> {
  const COLS = 4;
  const COL_W = 260;
  const ROW_H = 140;
  const positions = new Map<string, { x: number; y: number }>();
  nodes.forEach((node, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    positions.set(node.id, { x: col * COL_W + 40, y: row * ROW_H + 40 });
  });
  return positions;
}

export function adaptFeatureGraph(graph: FeatureGraph): {
  nodes: MockNode[];
  edges: MockEdge[];
} {
  const positions = layoutNodes(graph.nodes);
  const nodes: MockNode[] = graph.nodes.map<MockNode>((n) => ({
    id: n.id,
    type: n.type,
    label: n.label,
    status: n.status,
    ...(n.summary !== null ? { summary: n.summary } : {}),
    position: positions.get(n.id) ?? { x: 0, y: 0 },
    // Pass evidenceIds through so downstream pages can join nodes ↔ findings
    // via Evidence.findingId. Omit the key entirely when empty to keep the
    // serialized MockNode shape stable for snapshot-style assertions.
    ...(n.evidenceIds.length > 0 ? { evidenceIds: n.evidenceIds } : {}),
  }));
  const edges: MockEdge[] = graph.edges.map<MockEdge>((e: FeatureEdge) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: e.type,
  }));
  return { nodes, edges };
}
