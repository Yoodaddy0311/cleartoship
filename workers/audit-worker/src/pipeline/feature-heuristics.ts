// Heuristics shared by step 05 (DETECT_FEATURES). Keeping these in a separate
// module so the step file stays readable and the rules can be unit-tested in
// isolation. All inputs are derived from the cloned repo's file tree —
// step 05 has no access to file contents yet (that's step 06).

import type { PipelineState } from './steps/index.js';

type DetectedFeature = PipelineState['detectedFeatures'][number];

export const PAGE_RE = /^app\/(.*?)\/page\.(tsx?|jsx?)$/i;
export const API_RE = /^app\/api\/(.+?)\/route\.(ts|js)$/i;
const COMPONENT_RE = /^(?:app\/)?(?:.*?\/)?components\/([^/]+?)\.(tsx|jsx)$/i;
const ACTIONS_DIR_RE = /^(?:app\/)?(?:.*?\/)?actions\/([^/]+?)\.(ts|js|tsx|jsx)$/i;
const PROTECTED_GROUP_RE = /^app\/\((authenticated|auth|protected|dashboard)\)\//i;

const EXTERNAL_SERVICE_PATTERNS: ReadonlyArray<{ env: RegExp; id: string; label: string }> = [
  { env: /^STRIPE_/i, id: 'external_service.stripe', label: 'Stripe' },
  { env: /^OPENAI_/i, id: 'external_service.openai', label: 'OpenAI' },
  { env: /^ANTHROPIC_/i, id: 'external_service.anthropic', label: 'Anthropic' },
  { env: /^SENTRY_/i, id: 'external_service.sentry', label: 'Sentry' },
  { env: /^TWILIO_/i, id: 'external_service.twilio', label: 'Twilio' },
  { env: /^SENDGRID_/i, id: 'external_service.sendgrid', label: 'SendGrid' },
  { env: /^SUPABASE_/i, id: 'external_service.supabase', label: 'Supabase' },
  { env: /^FIREBASE_/i, id: 'external_service.firebase', label: 'Firebase' },
];

export function routeToId(prefix: string, route: string): string {
  return `${prefix}.${route.replace(/\//g, '.') || 'root'}`;
}

export function detectPages(fileTree: ReadonlyArray<string>): DetectedFeature[] {
  const pages: DetectedFeature[] = [];
  for (const path of fileTree) {
    const m = PAGE_RE.exec(path);
    if (!m) continue;
    const route = `/${m[1]}`;
    pages.push({
      id: routeToId('page', m[1] ?? ''),
      type: 'page',
      label: route === '/' ? '홈' : route,
      status: 'partial',
      confidence: 'MEDIUM',
      summary: `라우트 ${route}의 페이지 컴포넌트가 확인되었습니다.`,
    });
  }
  return pages;
}

export function detectApis(fileTree: ReadonlyArray<string>): DetectedFeature[] {
  const apis: DetectedFeature[] = [];
  for (const path of fileTree) {
    const m = API_RE.exec(path);
    if (!m) continue;
    const route = `/api/${m[1]}`;
    apis.push({
      id: routeToId('api', m[1] ?? ''),
      type: 'api',
      label: route,
      status: 'partial',
      confidence: 'MEDIUM',
      summary: `API 라우트 ${route}가 확인되었습니다.`,
    });
  }
  return apis;
}

export function detectComponents(fileTree: ReadonlyArray<string>): DetectedFeature[] {
  const components: DetectedFeature[] = [];
  const seen = new Set<string>();
  for (const path of fileTree) {
    const m = COMPONENT_RE.exec(path);
    if (!m) continue;
    const name = m[1] ?? 'Component';
    const id = `component.${name}`;
    if (seen.has(id)) continue;
    seen.add(id);
    components.push({
      id,
      type: 'component',
      label: name,
      status: 'unknown',
      confidence: 'LOW',
      summary: `컴포넌트 파일 ${path}가 감지되었습니다 (import 분석은 후속 단계에서).`,
    });
  }
  return components;
}

export function detectActions(fileTree: ReadonlyArray<string>): DetectedFeature[] {
  const actions: DetectedFeature[] = [];
  const seen = new Set<string>();
  for (const path of fileTree) {
    const m = ACTIONS_DIR_RE.exec(path);
    if (!m) continue;
    const name = m[1] ?? 'action';
    const id = `action.${name}`;
    if (seen.has(id)) continue;
    seen.add(id);
    actions.push({
      id,
      type: 'action',
      label: name,
      status: 'unknown',
      confidence: 'LOW',
      summary: `Server action 파일 ${path}가 감지되었습니다 (use server 디렉티브는 step06에서 검증).`,
    });
  }
  return actions;
}

export function detectAuthGuard(fileTree: ReadonlyArray<string>): DetectedFeature | null {
  const hasMiddleware = fileTree.some((p) => p === 'middleware.ts' || p === 'middleware.js');
  const hasProtectedGroup = fileTree.some((p) => PROTECTED_GROUP_RE.test(p));
  if (!hasMiddleware && !hasProtectedGroup) return null;
  return {
    id: 'auth_guard.middleware',
    type: 'auth_guard',
    label: hasMiddleware ? 'middleware.ts 인증 가드' : '(authenticated) 라우트 그룹',
    status: hasMiddleware ? 'partial' : 'ui_only',
    confidence: hasMiddleware ? 'HIGH' : 'MEDIUM',
    summary: hasMiddleware
      ? 'middleware.ts가 존재하여 인증 가드로 추정됩니다.'
      : '보호된 라우트 그룹이 감지되었으나 미들웨어가 없습니다.',
  };
}

export function detectExternalServices(fileTree: ReadonlyArray<string>): DetectedFeature[] {
  const hasEnvExample = fileTree.some(
    (p) => p === '.env.example' || p === '.env.template' || p.endsWith('/.env.example'),
  );
  if (!hasEnvExample) return [];
  return EXTERNAL_SERVICE_PATTERNS.map((spec) => ({
    id: spec.id,
    type: 'external_service' as const,
    label: spec.label,
    status: 'unknown' as const,
    confidence: 'LOW' as const,
    summary: `.env.example 파일이 있어 ${spec.label} 연동 가능성이 있습니다 (실제 키는 step06에서 검증).`,
  }));
}

/**
 * Derive page/api status from the REAL edges present on the feature set
 * (immutable: rebuilds each feature's `status`, never mutating callers' edges).
 *
 * This runs on the step05 FALLBACK path only (no clonePath → step10 can't read
 * file contents). The accurate path uses audit-core `deriveNodeStatus` over the
 * content-extracted edges. Rules here mirror it as closely as the file-tree-only
 * signal allows:
 *   - page reaching a backend (calls_api / triggers) → 'complete'
 *   - page with only a missing_link                  → 'partial'
 *   - page with neither                              → 'ui_only'
 *   - api / action that is never the target of a caller edge → 'logic_only'
 *
 * On the pure file-tree path no calls_api edges exist yet, so pages collapse to
 * 'ui_only' and apis to 'logic_only' — an honest "we couldn't prove a
 * connection from the file tree alone" rather than a fabricated domain match.
 */
export function refineFrontBackStatus(features: DetectedFeature[]): void {
  const inboundCallers = new Set<string>();
  for (const f of features) {
    for (const e of f.edges ?? []) {
      if (e.type === 'calls_api' || e.type === 'triggers') inboundCallers.add(e.target);
    }
  }
  for (const page of features.filter((f) => f.type === 'page')) {
    const edges = page.edges ?? [];
    const reachesBackend = edges.some((e) => e.type === 'calls_api' || e.type === 'triggers');
    const hasMissingLink = edges.some((e) => e.type === 'missing_link');
    page.status = reachesBackend ? 'complete' : hasMissingLink ? 'partial' : 'ui_only';
  }
  for (const node of features.filter((f) => f.type === 'api' || f.type === 'action')) {
    node.status = inboundCallers.has(node.id) ? 'complete' : 'logic_only';
  }
}

/** page → auth_guard `requires_auth` when page sits under a protected group. */
export function buildAuthEdges(
  features: DetectedFeature[],
  fileTree: ReadonlyArray<string>,
): void {
  const guard = features.find((f) => f.type === 'auth_guard');
  if (!guard) return;
  for (const page of features.filter((f) => f.type === 'page')) {
    const original = fileTree.find((p) => {
      const m = PAGE_RE.exec(p);
      if (!m) return false;
      return `/${m[1]}` === page.label || (page.label === '홈' && m[1] === '');
    });
    if (!original) continue;
    if (!PROTECTED_GROUP_RE.test(original)) continue;
    page.edges = [
      ...(page.edges ?? []),
      { target: guard.id, type: 'requires_auth' },
    ];
  }
}
