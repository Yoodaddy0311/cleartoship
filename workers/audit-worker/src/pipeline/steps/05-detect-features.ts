import type { Step, PipelineState } from './index.js';
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
    ctx.log('info', 'Features detected', {
      count: features.length,
      byType: countByType(features),
    });
  },
};

function countByType(features: PipelineState['detectedFeatures']): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of features) out[f.type] = (out[f.type] ?? 0) + 1;
  return out;
}
