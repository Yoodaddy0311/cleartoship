import type { Step } from './index.js';
import { buildFeatureGraph } from '@cleartoship/audit-core';
import { writeFeatureGraph } from '../../firestore/writers.js';

export const step10GenerateFeatureGraph: Step = {
  step: 'GENERATE_FEATURE_GRAPH',
  async execute(ctx, state) {
    const graph = buildFeatureGraph({
      auditRunId: ctx.runId,
      detected: state.detectedFeatures.map((d) => ({
        id: d.id,
        type: d.type,
        label: d.label,
        status: d.status,
        confidence: d.confidence,
        summary: d.summary,
        edges: d.edges,
      })),
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
