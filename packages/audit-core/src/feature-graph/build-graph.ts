import type {
  FeatureEdge,
  FeatureGraph,
  FeatureNode,
  Finding,
} from '@cleartoship/shared-types';

/**
 * Feature graph builder — turns a flat list of detected feature primitives
 * (pages, APIs, data models) into a connected graph with rolled-up status.
 *
 * Pure: callable from both the worker pipeline (Sprint 1+) and unit tests.
 */

export interface DetectedFeaturePrimitive {
  /** Stable id derived from the file path or route, e.g. `page.dashboard`. */
  id: string;
  type: FeatureNode['type'];
  label: string;
  status: FeatureNode['status'];
  confidence: FeatureNode['confidence'];
  risk?: FeatureNode['risk'];
  summary?: string | null;
  /** Outgoing edges keyed by target node id. */
  edges?: Array<{
    target: string;
    type: FeatureEdge['type'];
    status?: FeatureEdge['status'];
    summary?: string | null;
  }>;
}

export interface BuildGraphInput {
  auditRunId: string;
  detected: ReadonlyArray<DetectedFeaturePrimitive>;
  findings: ReadonlyArray<Pick<Finding, 'category' | 'severity' | 'tags'>>;
}

export function buildFeatureGraph(input: BuildGraphInput): FeatureGraph {
  const now = new Date().toISOString();
  const nodes: FeatureNode[] = input.detected.map((p) => ({
    id: p.id,
    type: p.type,
    label: p.label,
    status: p.status,
    risk: p.risk ?? null,
    confidence: p.confidence,
    summary: p.summary ?? null,
    evidenceIds: [],
    tags: [],
  }));

  const edges: FeatureEdge[] = [];
  let edgeIdx = 0;
  for (const p of input.detected) {
    for (const e of p.edges ?? []) {
      edges.push({
        id: `edge_${edgeIdx++}`,
        source: p.id,
        target: e.target,
        type: e.type,
        status: e.status ?? deriveEdgeStatus(p.status),
        summary: e.summary ?? null,
      });
    }
  }

  const summary = composeGraphSummary(nodes, input.findings);

  return {
    id: 'main',
    auditRunId: input.auditRunId,
    nodes,
    edges,
    summary,
    createdAt: now,
    updatedAt: now,
  };
}

function deriveEdgeStatus(nodeStatus: FeatureNode['status']): FeatureEdge['status'] {
  if (nodeStatus === 'missing_connection') return 'missing_connection';
  if (nodeStatus === 'missing') return 'missing';
  if (nodeStatus === 'risky') return 'risky';
  return 'complete';
}

function composeGraphSummary(
  nodes: ReadonlyArray<FeatureNode>,
  findings: ReadonlyArray<Pick<Finding, 'severity'>>,
): string {
  const total = nodes.length;
  const complete = nodes.filter((n) => n.status === 'complete').length;
  const risky = nodes.filter((n) => n.status === 'risky').length;
  const missingChain = nodes.filter((n) => n.status === 'missing_connection').length;
  const p0 = findings.filter((f) => f.severity === 'P0').length;

  return [
    `총 ${total}개 기능 노드 (구현 완료 ${complete}, 위험 ${risky}, 연결 누락 ${missingChain}).`,
    p0 > 0 ? `출시 차단 P0 이슈 ${p0}개가 식별되었습니다.` : '출시 차단 P0 이슈는 없습니다.',
  ].join(' ');
}
