// Derive each node's ImplementationStatus from the REAL extracted edges, not
// from a first-path-segment domain guess (the old `refineFrontBackStatus`).
//
// Rules:
//   - page:
//       · reaches a backend (calls_api → existing api, or triggers → action) → complete
//       · has only a missing_link (renders but the backend is absent)        → partial
//       · has only contains/renders/requires_auth (no backend reach)         → ui_only
//   - api / action:
//       · has at least one inbound caller (calls_api / triggers)             → complete
//       · no inbound caller                                                   → logic_only
//   - data_model / external_service / auth_guard / others                     → untouched
//
// Pure: returns a NEW node array (immutable — never mutates the inputs).

import type { FeatureEdgeType } from '@cleartoship/shared-types';
import type { GraphNode } from './build-nodes.js';
import type { ExtractedEdge } from './extract-edges.js';

const BACKEND_REACHING: ReadonlySet<FeatureEdgeType> = new Set([
  'calls_api',
  'triggers',
]);

function outgoing(
  nodeId: string,
  edgeMap: ReadonlyMap<string, ReadonlyArray<ExtractedEdge>>,
): ReadonlyArray<ExtractedEdge> {
  return edgeMap.get(nodeId) ?? [];
}

/** Set of node ids that are the TARGET of at least one calls_api/triggers edge. */
function buildInboundCallers(
  edgeMap: ReadonlyMap<string, ReadonlyArray<ExtractedEdge>>,
): Set<string> {
  const called = new Set<string>();
  for (const edges of edgeMap.values()) {
    for (const e of edges) {
      if (BACKEND_REACHING.has(e.type)) called.add(e.target);
    }
  }
  return called;
}

export function deriveNodeStatus(
  nodes: ReadonlyArray<GraphNode>,
  edgeMap: ReadonlyMap<string, ReadonlyArray<ExtractedEdge>>,
): GraphNode[] {
  const inboundCallers = buildInboundCallers(edgeMap);

  return nodes.map((node) => {
    // PRESERVE 'missing' set by the extractor (e.g. the api node created in
    // scanFetches for an unresolved fetch target). The extractor uses 'missing'
    // as a deliberate marker that the node does not exist in the codebase;
    // overwriting it to logic_only would defeat the canvas's gap-rendering
    // intent — the whole point of creating these nodes is so the unfulfilled
    // call site is rendered visually as missing rather than dropped.
    if (node.status === 'missing') return node;

    if (node.type === 'page') {
      const edges = outgoing(node.id, edgeMap);
      const reachesBackend = edges.some((e) => BACKEND_REACHING.has(e.type));
      const hasMissingLink = edges.some((e) => e.type === 'missing_link');
      if (reachesBackend) return { ...node, status: 'complete' as const };
      if (hasMissingLink) return { ...node, status: 'partial' as const };
      return { ...node, status: 'ui_only' as const };
    }
    if (node.type === 'api' || node.type === 'action') {
      const hasCaller = inboundCallers.has(node.id);
      return { ...node, status: hasCaller ? ('complete' as const) : ('logic_only' as const) };
    }
    return node;
  });
}
