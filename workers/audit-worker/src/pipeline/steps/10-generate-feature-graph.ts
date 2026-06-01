import type { Step } from './index.js';
import { buildFeatureGraph, type DetectedFeaturePrimitive } from '@cleartoship/audit-core';
// Deep import (NOT the barrel): assemble-detected transitively imports
// node:fs / node:path (disk IO). Importing it via the dedicated subpath export
// keeps those node-only modules out of the audit-core barrel so a future
// `'use client'` barrel import can never drag node:fs into the client bundle.
// Mirrors the dashboard's `@cleartoship/audit-core/scoring/apply-enrichment`.
import { assembleDetectedFeatures } from '@cleartoship/audit-core/feature-graph/edge-extract/assemble-detected';
import { writeFeatureGraph } from '../../firestore/writers.js';

/**
 * GENERATE_FEATURE_GRAPH (step10).
 *
 * Accurate path (clonePath present): build nodes from the route + data-model
 * inventories and content discovery, then extract edges by reading file
 * contents (imports → contains/triggers, fetch/axios → calls_api, ORM usage →
 * reads_from/writes_to). Edges only ever point at existing nodes; unresolvable
 * page fetches create a REAL `missing` node so the canvas renders the gap.
 *
 * Dev/fallback path (no clonePath): reuse the pre-built `state.detectedFeatures`
 * primitives from step05 — the step never throws when the clone is unavailable.
 */
export const step10GenerateFeatureGraph: Step = {
  step: 'GENERATE_FEATURE_GRAPH',
  async execute(ctx, state) {
    let detected: DetectedFeaturePrimitive[];

    if (ctx.clonePath) {
      try {
        detected = await assembleDetectedFeatures({
          clonePath: ctx.clonePath,
          fileTree: state.fileTree,
          routeInventory: state.routeInventory,
          dataModelInventory: state.dataModelInventory,
        });
      } catch (e) {
        ctx.log('warn', 'assembleDetectedFeatures failed; falling back to step05 features', {
          error: (e as Error).message,
        });
        detected = mapStateFeatures(state.detectedFeatures);
      }
    } else {
      detected = mapStateFeatures(state.detectedFeatures);
    }

    const graph = buildFeatureGraph({
      auditRunId: ctx.runId,
      detected,
      findings: state.pendingFindings.map((f) => ({
        category: f.category,
        severity: f.severity,
        tags: f.tags,
      })),
    });

    await writeFeatureGraph(ctx.runId, {
      auditRunId: graph.auditRunId,
      nodes: graph.nodes,
      edges: graph.edges,
      summary: graph.summary,
    });

    ctx.log('info', 'Feature graph generated', {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
    });
  },
};

function mapStateFeatures(
  features: ReadonlyArray<{
    id: string;
    type: DetectedFeaturePrimitive['type'];
    label: string;
    status: DetectedFeaturePrimitive['status'];
    confidence: DetectedFeaturePrimitive['confidence'];
    summary: string | null;
    edges?: DetectedFeaturePrimitive['edges'];
  }>,
): DetectedFeaturePrimitive[] {
  return features.map((d) => ({
    id: d.id,
    type: d.type,
    label: d.label,
    status: d.status,
    confidence: d.confidence,
    summary: d.summary,
    edges: d.edges,
  }));
}
