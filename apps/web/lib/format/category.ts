import type { AuditCategory as SharedAuditCategory } from '@cleartoship/shared-types';

/**
 * 11 audit categories surfaced in the UI — re-exported from shared-types so
 * the web app and workers share a single source of truth. The shared enum
 * uses UPPER_SNAKE casing (matches Firestore-stored values + worker
 * emissions).
 *
 * Note: shared-types includes MAINTAINABILITY_DOCUMENTATION (12 values total)
 * but the UI omits it — that category is internal-only.
 */
export type AuditCategory = Exclude<SharedAuditCategory, 'MAINTAINABILITY_DOCUMENTATION'>;

export const ALL_CATEGORIES: AuditCategory[] = [
  'PRODUCT_INTENT',
  'REQUIREMENT_COVERAGE',
  'FEATURE_GRAPH',
  'FUNCTIONAL_FLOW',
  'UX_UI',
  'FRONTEND_CODE',
  'BACKEND_API',
  'DATA_MODEL',
  'SECURITY_PRIVACY',
  'LAUNCH_READINESS',
  'BUSINESS_READINESS',
];

/**
 * Korean labels per category. Typed as Record<AuditCategory, string> so TS
 * fails the build if a category is missing or misspelled.
 */
const CATEGORY_LABELS_KO: Record<AuditCategory, string> = {
  PRODUCT_INTENT: '제품 의도',
  REQUIREMENT_COVERAGE: '요구사항 커버리지',
  FEATURE_GRAPH: '기능 관계도',
  FUNCTIONAL_FLOW: '기능 플로우',
  UX_UI: 'UX/UI',
  FRONTEND_CODE: '프론트엔드 코드',
  BACKEND_API: '백엔드/API',
  DATA_MODEL: '데이터 모델',
  SECURITY_PRIVACY: '보안/개인정보',
  LAUNCH_READINESS: '출시 준비도',
  BUSINESS_READINESS: '비즈니스 준비도',
};

export function categoryLabel(c: AuditCategory): string {
  return CATEGORY_LABELS_KO[c] ?? c;
}
