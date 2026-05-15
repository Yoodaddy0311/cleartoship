import type { AuditCategory } from '@cleartoship/shared-types';

/**
 * Category metadata used by scoring + report rendering.
 * Weights from `03_audit_checklist_scoring_rubric.md` §1.2 (sum = 100).
 *
 * Spec §1.2 lists weights only for 8 categories
 * (FEATURE_GRAPH..MAINTAINABILITY_DOCUMENTATION). PRODUCT_INTENT and
 * REQUIREMENT_COVERAGE are recognized categories but carry weight 0 — they
 * surface findings but do not contribute to the weighted overall score.
 *
 * Note: Feature Graph and Functional Flow share the spec's 20% "Feature Graph
 * & Functional Coverage" bucket — we split 10/10 so each category is scored
 * independently while preserving the bucket weight.
 *
 * Sum check: 0+0+10+10+15+10+15+10+15+10+5 = 100.
 */
export interface CategoryMeta {
  category: AuditCategory;
  label: string;
  weight: number;
}

export const CATEGORY_META: ReadonlyArray<CategoryMeta> = [
  { category: 'PRODUCT_INTENT', label: 'Product Intent', weight: 0 },
  { category: 'REQUIREMENT_COVERAGE', label: 'Requirement Coverage', weight: 0 },
  { category: 'FEATURE_GRAPH', label: 'Feature Graph', weight: 10 },
  { category: 'FUNCTIONAL_FLOW', label: 'Functional Flow', weight: 10 },
  { category: 'UX_UI', label: 'UX/UI & Accessibility', weight: 15 },
  { category: 'FRONTEND_CODE', label: 'Frontend Code', weight: 10 },
  { category: 'BACKEND_API', label: 'Backend / API', weight: 15 },
  { category: 'DATA_MODEL', label: 'Data Model', weight: 10 },
  { category: 'SECURITY_PRIVACY', label: 'Security & Privacy', weight: 15 },
  { category: 'LAUNCH_READINESS', label: 'Launch Readiness', weight: 10 },
  { category: 'MAINTAINABILITY_DOCUMENTATION', label: 'Maintainability & Docs', weight: 5 },
];

const META_BY_CATEGORY = new Map<AuditCategory, CategoryMeta>(
  CATEGORY_META.map((m) => [m.category, m]),
);

export function getCategoryMeta(category: AuditCategory): CategoryMeta {
  const meta = META_BY_CATEGORY.get(category);
  if (!meta) {
    throw new Error(`Unknown audit category: ${category}`);
  }
  return meta;
}
