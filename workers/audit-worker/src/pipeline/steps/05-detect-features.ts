import type { Step, PipelineState } from './index.js';
import { buildRouteInventory } from '@cleartoship/audit-core';
import {
  buildAuthEdges,
  buildPageApiEdges,
  buildPageComponentEdges,
  detectActions,
  detectApis,
  detectAuthGuard,
  detectComponents,
  detectExternalServices,
  detectPages,
  refineFrontBackStatus,
} from '../feature-heuristics.js';

/**
 * Heuristic feature detection from the cloned repo's file tree.
 * Outputs nodes the Feature Graph step will consume. Status fields use the
 * full ImplementationStatus enum where possible (ui_only, logic_only, unknown,
 * partial). Body content is intentionally not inspected here — that's step 06.
 */
export const step05DetectFeatures: Step = {
  step: 'DETECT_FEATURES',
  async execute(ctx, state) {
    const features: PipelineState['detectedFeatures'] = [];

    features.push(...detectPages(state.fileTree));
    features.push(...detectApis(state.fileTree));
    features.push(...detectComponents(state.fileTree));
    features.push(...detectActions(state.fileTree));
    features.push(...detectExternalServices(state.fileTree));

    const guard = detectAuthGuard(state.fileTree);
    if (guard) features.push(guard);

    if (state.fileTree.includes('prisma/schema.prisma')) {
      features.push({
        id: 'data_model.prisma',
        type: 'data_model',
        label: 'Prisma 스키마',
        status: 'partial',
        confidence: 'HIGH',
        summary: 'prisma/schema.prisma에 모델이 정의되어 있습니다.',
      });
    }

    refineFrontBackStatus(features);
    buildPageApiEdges(features);
    buildAuthEdges(features, state.fileTree);
    buildPageComponentEdges(features, state.fileTree);

    state.detectedFeatures = features;

    // PR-A3 — AST-derived RouteInventory (Next.js App + Pages Router).
    // Co-exists with the file-glob heuristics above: the inventory is a
    // structured, framework-aware view (segments, dynamic flags,
    // exportedMethods) that scoring + the future feature-graph UI consume.
    // `ctx.clonePath` may be falsy on dev paths where step03 was skipped;
    // we tolerate that and pass an empty path which the route extractors
    // handle gracefully (they only need fileTree).
    try {
      state.routeInventory = await buildRouteInventory(
        ctx.clonePath ?? '',
        state.fileTree
      );
    } catch (e) {
      ctx.log('warn', 'buildRouteInventory failed', {
        error: (e as Error).message,
      });
      // state.routeInventory keeps its EMPTY initial value — downstream
      // consumers treat that as "no routes detected".
    }

    ctx.log('info', 'Features detected', {
      count: features.length,
      byType: countByType(features),
      routes: state.routeInventory.routes.length,
      pages: state.routeInventory.counts.pages,
      apis: state.routeInventory.counts.apis,
    });
  },
};

function countByType(features: PipelineState['detectedFeatures']): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of features) out[f.type] = (out[f.type] ?? 0) + 1;
  return out;
}
