/**
 * Adapters between API DTOs (shared-types Firestore-aligned shapes) and the
 * UI's MockFinding / MockNode / MockEvidence shapes. Keeping these as a thin
 * mapping layer lets us swap mocks → live data without touching dozens of
 * downstream components.
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
} from '@cleartoship/shared-types';
import type { LaunchStatus as UiLaunchStatus } from '@/lib/format/status';
import type { AuditCategory } from '@/lib/format/category';
import type { Severity } from '@/lib/format/severity';
import type {
  MockEdge,
  MockEvidence,
  MockFinding,
  MockNode,
} from '@/lib/mock/audit-fixture';

const LAUNCH_STATUS_MAP: Record<ApiLaunchStatus, UiLaunchStatus> = {
  READY: 'ready',
  CONDITIONAL: 'ready_with_improvements',
  NEEDS_WORK: 'needs_work',
  AT_RISK: 'needs_work',
  NOT_READY: 'stop',
};

export function adaptLaunchStatus(s: ApiLaunchStatus): UiLaunchStatus {
  return LAUNCH_STATUS_MAP[s];
}

const CONFIDENCE_MAP: Record<ApiConfidence, MockFinding['confidence']> = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

/** Categorize the 11 shared categories down to the 10 the UI renders. */
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
  };
  for (const cs of list) {
    if (isUiCategory(cs.category)) {
      initial[cs.category] = Math.round(cs.score);
    }
  }
  return initial;
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
): MockFinding {
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
  };
}

export function adaptEvidence(e: Evidence): MockEvidence {
  const evidence: MockEvidence = {
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
  }));
  const edges: MockEdge[] = graph.edges.map<MockEdge>((e: FeatureEdge) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: e.type,
  }));
  return { nodes, edges };
}
