// Orchestrator: clonePath + inventories → DetectedFeaturePrimitive[] ready for
// `buildFeatureGraph`. Wires the four pure edge-extract modules together:
//
//   buildNodes  → extractEdges → (append the `missing` nodes it created)
//               → deriveNodeStatus → shape into DetectedFeaturePrimitive[]
//
// This is the single function the worker's step10 calls when `ctx.clonePath` is
// available. When there is no clonePath (dev path), the worker keeps using the
// pre-existing `state.detectedFeatures` instead (handled at the call site).
//
// Pure-with-IO: reads files, never mutates inputs, returns a new array.

import type {
  DataModelInventory,
  RouteInventory,
} from '@cleartoship/shared-types';
import { buildNodes, type GraphNode } from './build-nodes.js';
import { extractEdges, type ExtractedEdge } from './extract-edges.js';
import { deriveNodeStatus } from './derive-status.js';
import type { DetectedFeaturePrimitive } from '../build-graph.js';

export interface AssembleInput {
  readonly clonePath: string;
  readonly fileTree: ReadonlyArray<string>;
  readonly routeInventory: RouteInventory;
  readonly dataModelInventory: DataModelInventory;
}

function toPrimitive(
  node: GraphNode,
  edges: ReadonlyArray<ExtractedEdge>,
): DetectedFeaturePrimitive {
  return {
    id: node.id,
    type: node.type,
    label: node.label,
    status: node.status,
    confidence: node.confidence,
    summary: node.summary,
    edges: edges.map((e) => ({ target: e.target, type: e.type, summary: e.summary ?? null })),
  };
}

export async function assembleDetectedFeatures(
  input: AssembleInput,
): Promise<DetectedFeaturePrimitive[]> {
  const { nodes, sourceByNodeId } = buildNodes({
    fileTree: input.fileTree,
    routeInventory: input.routeInventory,
    dataModelInventory: input.dataModelInventory,
  });

  const edgeMap = await extractEdges({
    clonePath: input.clonePath,
    fileTree: input.fileTree,
    routeInventory: input.routeInventory,
    dataModelInventory: input.dataModelInventory,
    nodes,
    sourceByNodeId,
  });

  // Append the real `missing` nodes the extractor created so their
  // missing_link edges have a resolvable target (the canvas drops edges whose
  // target node is absent).
  const allNodes: GraphNode[] = [...nodes, ...edgeMap.extraNodes];

  // Status comes from the REAL edges, not a path-segment domain guess.
  const statusedNodes = deriveNodeStatus(allNodes, edgeMap);

  return statusedNodes.map((node) => toPrimitive(node, edgeMap.get(node.id) ?? []));
}
