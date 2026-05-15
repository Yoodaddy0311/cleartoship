import type { Step, PipelineState } from './index.js';

const PAGE_RE = /^app\/(.*?)\/page\.(tsx?|jsx?)$/i;
const API_RE = /^app\/api\/(.+?)\/route\.(ts|js)$/i;

/**
 * Heuristic feature detection from the (mock) file tree.
 * Outputs nodes the Feature Graph step will consume.
 */
export const step05DetectFeatures: Step = {
  step: 'DETECT_FEATURES',
  async execute(ctx, state) {
    const features: PipelineState['detectedFeatures'] = [];

    // Pages.
    for (const path of state.fileTree) {
      const m = PAGE_RE.exec(path);
      if (m) {
        const route = `/${m[1]}`;
        const id = `page.${m[1]!.replace(/\//g, '.') || 'root'}`;
        features.push({
          id,
          type: 'page',
          label: route === '/' ? '홈' : route,
          status: 'partial',
          confidence: 'MEDIUM',
          summary: `라우트 ${route}의 페이지 컴포넌트가 확인되었습니다.`,
        });
      }
    }

    // APIs.
    for (const path of state.fileTree) {
      const m = API_RE.exec(path);
      if (m) {
        const route = `/api/${m[1]}`;
        const id = `api.${m[1]!.replace(/\//g, '.')}`;
        features.push({
          id,
          type: 'api',
          label: route,
          status: 'partial',
          confidence: 'MEDIUM',
          summary: `API 라우트 ${route}가 확인되었습니다.`,
        });
      }
    }

    // Data model (prisma).
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

    // Bridge edges: page → api (best-effort by name).
    for (const page of features.filter((f) => f.type === 'page')) {
      const candidate = features.find(
        (f) => f.type === 'api' && f.label.includes(page.label.replace(/^\//, '').split('/')[0]!),
      );
      if (candidate) {
        page.edges = [
          ...(page.edges ?? []),
          { target: candidate.id, type: 'calls_api' },
        ];
      }
    }

    state.detectedFeatures = features;
    ctx.log('info', 'Features detected', { count: features.length });
  },
};
