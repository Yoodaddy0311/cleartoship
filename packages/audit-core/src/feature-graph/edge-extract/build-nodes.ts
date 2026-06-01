// Build the feature-graph node set from the structured inventories the pipeline
// already produced (route + data-model) PLUS lightweight content discovery for
// components/actions. This REPLACES the old file-glob node detection that
// mis-counted top-level `components/` and let test/config files become nodes.
//
// Node sources:
//   - page / api      → `routeInventory.routes` (AST-derived, framework-aware)
//   - component        → files under any `components/` dir (taxonomy/shadcn
//                        keep components at the repo root, not co-located)
//   - action           → files under any `actions/` dir
//   - data_model       → `dataModelInventory.entities`
//   - auth_guard        → middleware.ts / protected route group presence
//   - external_service → .env.example presence (preserved heuristic)
//
// Every candidate file passes through `isExcludedFile`, so a `narrative.test.ts`
// or `Button.stories.tsx` never becomes a node. De-duped by id. Pure: derives
// everything from the inputs and returns new structures (never mutates inputs).

import type {
  Confidence,
  DataModelInventory,
  FeatureNodeType,
  ImplementationStatus,
  RouteInventory,
} from '@cleartoship/shared-types';
import { isExcludedFile } from './exclude-file.js';

/** A graph node before status refinement (status starts as a neutral default). */
export interface GraphNode {
  id: string;
  type: FeatureNodeType;
  label: string;
  status: ImplementationStatus;
  confidence: Confidence;
  summary: string | null;
}

export interface BuildNodesInput {
  readonly fileTree: ReadonlyArray<string>;
  readonly routeInventory: RouteInventory;
  readonly dataModelInventory: DataModelInventory;
}

export interface BuildNodesResult {
  readonly nodes: ReadonlyArray<GraphNode>;
  /** node id → its source file (page/api/component/action), for edge extraction. */
  readonly sourceByNodeId: Readonly<Record<string, string>>;
}

const COMPONENT_FILE_RE = /(^|\/)components\/(.+)\.(tsx|jsx|ts|js)$/i;
const ACTION_FILE_RE = /(^|\/)actions\/(.+)\.(tsx|jsx|ts|js)$/i;
const PROTECTED_GROUP_RE = /(^|\/)\((authenticated|auth|protected|dashboard)\)\//i;

const EXTERNAL_SERVICES: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'external_service.stripe', label: 'Stripe' },
  { id: 'external_service.openai', label: 'OpenAI' },
  { id: 'external_service.anthropic', label: 'Anthropic' },
  { id: 'external_service.sentry', label: 'Sentry' },
  { id: 'external_service.twilio', label: 'Twilio' },
  { id: 'external_service.sendgrid', label: 'SendGrid' },
  { id: 'external_service.supabase', label: 'Supabase' },
  { id: 'external_service.firebase', label: 'Firebase' },
];

/** Stable id for a route (page/api) keyed off its normalised urlPath. */
export function routeNodeId(prefix: 'page' | 'api', urlPath: string): string {
  const cleaned = urlPath.replace(/^\//, '').replace(/\//g, '.') || 'root';
  return `${prefix}.${cleaned}`;
}

/** `components/ui/button.tsx` → label `button`, id `component.ui.button`. */
function componentLabelFromPath(relPath: string): { id: string; label: string } | null {
  const m = COMPONENT_FILE_RE.exec(relPath.replace(/\\/g, '/'));
  if (!m) return null;
  const rel = m[2] ?? '';
  const label = rel.split('/').pop() ?? rel;
  const id = `component.${rel.replace(/\//g, '.')}`;
  return { id, label };
}

function actionLabelFromPath(relPath: string): { id: string; label: string } | null {
  const m = ACTION_FILE_RE.exec(relPath.replace(/\\/g, '/'));
  if (!m) return null;
  const rel = m[2] ?? '';
  const label = rel.split('/').pop() ?? rel;
  const id = `action.${rel.replace(/\//g, '.')}`;
  return { id, label };
}

export function buildNodes(input: BuildNodesInput): BuildNodesResult {
  const nodes: GraphNode[] = [];
  const sourceByNodeId: Record<string, string> = {};
  const seen = new Set<string>();

  const push = (node: GraphNode, sourceFile?: string): void => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    nodes.push(node);
    if (sourceFile) sourceByNodeId[node.id] = sourceFile;
  };

  // page + api nodes — from the AST route inventory.
  for (const route of input.routeInventory.routes) {
    if (isExcludedFile(route.sourceFile)) continue;
    const prefix = route.type === 'api' ? 'api' : 'page';
    const id = routeNodeId(prefix, route.urlPath);
    const label =
      route.type === 'page'
        ? route.urlPath === '/'
          ? '홈'
          : route.urlPath
        : route.urlPath;
    push(
      {
        id,
        type: route.type === 'api' ? 'api' : 'page',
        label,
        status: 'partial',
        confidence: 'MEDIUM',
        summary:
          route.type === 'page'
            ? `라우트 ${route.urlPath}의 페이지가 확인되었습니다.`
            : `API 라우트 ${route.urlPath}가 확인되었습니다.`,
      },
      route.sourceFile,
    );
  }

  // component + action nodes — content discovery, excluding test/config/story.
  for (const rel of input.fileTree) {
    if (isExcludedFile(rel)) continue;
    const comp = componentLabelFromPath(rel);
    if (comp) {
      push(
        {
          id: comp.id,
          type: 'component',
          label: comp.label,
          status: 'unknown',
          confidence: 'LOW',
          summary: `컴포넌트 파일 ${rel}가 감지되었습니다.`,
        },
        rel,
      );
      continue;
    }
    const action = actionLabelFromPath(rel);
    if (action) {
      push(
        {
          id: action.id,
          type: 'action',
          label: action.label,
          status: 'unknown',
          confidence: 'LOW',
          summary: `Server action 파일 ${rel}가 감지되었습니다.`,
        },
        rel,
      );
    }
  }

  // data_model nodes — from the data-model inventory.
  for (const entity of input.dataModelInventory.entities) {
    push({
      id: `data_model.${entity.name}`,
      type: 'data_model',
      label: entity.name,
      status: 'partial',
      confidence: 'HIGH',
      summary: `데이터 모델 ${entity.name} (${entity.fieldCount ?? '?'} 필드)가 정의되어 있습니다.`,
    });
  }

  // auth_guard node — preserved heuristic.
  const hasMiddleware = input.fileTree.some(
    (p) => p === 'middleware.ts' || p === 'middleware.js' || p.endsWith('/middleware.ts'),
  );
  const hasProtectedGroup = input.fileTree.some((p) => PROTECTED_GROUP_RE.test(p));
  if (hasMiddleware || hasProtectedGroup) {
    push({
      id: 'auth_guard.middleware',
      type: 'auth_guard',
      label: hasMiddleware ? 'middleware.ts 인증 가드' : '(authenticated) 라우트 그룹',
      status: hasMiddleware ? 'partial' : 'ui_only',
      confidence: hasMiddleware ? 'HIGH' : 'MEDIUM',
      summary: hasMiddleware
        ? 'middleware.ts가 존재하여 인증 가드로 추정됩니다.'
        : '보호된 라우트 그룹이 감지되었으나 미들웨어가 없습니다.',
    });
  }

  // external_service nodes — preserved .env.example heuristic.
  const hasEnvExample = input.fileTree.some(
    (p) => p === '.env.example' || p === '.env.template' || p.endsWith('/.env.example'),
  );
  if (hasEnvExample) {
    for (const svc of EXTERNAL_SERVICES) {
      push({
        id: svc.id,
        type: 'external_service',
        label: svc.label,
        status: 'unknown',
        confidence: 'LOW',
        summary: `.env.example 파일이 있어 ${svc.label} 연동 가능성이 있습니다.`,
      });
    }
  }

  return { nodes, sourceByNodeId };
}
