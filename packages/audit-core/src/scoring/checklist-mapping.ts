import type { AuditCategory, AuditStep } from '@cleartoship/shared-types';

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
 *
 * `measuredBy` (SCORE-1B-a): the pipeline steps that actually produce findings
 * for this category. A category with an empty `measuredBy` has no signal
 * source today — it would otherwise sit at the 100 baseline and inflate the
 * overall score. The scorer treats such categories as N/A (score=null,
 * excluded from the weighted average). Adding a new signal source = add the
 * AuditStep to this list.
 */
export interface CategoryMeta {
  category: AuditCategory;
  label: string;
  weight: number;
  /** Pipeline steps that emit findings into this category. */
  measuredBy: ReadonlyArray<AuditStep>;
}

export const CATEGORY_META: ReadonlyArray<CategoryMeta> = [
  { category: 'PRODUCT_INTENT', label: 'Product Intent', weight: 0, measuredBy: [] },
  { category: 'REQUIREMENT_COVERAGE', label: 'Requirement Coverage', weight: 0, measuredBy: [] },
  { category: 'FEATURE_GRAPH', label: 'Feature Graph', weight: 10, measuredBy: [] },
  { category: 'FUNCTIONAL_FLOW', label: 'Functional Flow', weight: 10, measuredBy: [] },
  {
    category: 'UX_UI',
    label: 'UX/UI & Accessibility',
    weight: 15,
    // Lighthouse a11y/UX findings are produced inside ANALYZE_DEPLOY_URL.
    measuredBy: ['ANALYZE_DEPLOY_URL'],
  },
  { category: 'FRONTEND_CODE', label: 'Frontend Code', weight: 10, measuredBy: [] },
  {
    category: 'BACKEND_API',
    label: 'Backend / API',
    weight: 15,
    // Risky-function heuristics surface payment/delete/data-mutation findings
    // into BACKEND_API.
    measuredBy: ['DISCOVER_RISKY_FUNCTIONS'],
  },
  { category: 'DATA_MODEL', label: 'Data Model', weight: 10, measuredBy: [] },
  {
    category: 'SECURITY_PRIVACY',
    label: 'Security & Privacy',
    weight: 15,
    measuredBy: [
      'RUN_STATIC_ANALYSIS',     // semgrep
      'RUN_DEPENDENCY_SCAN',     // osv-scanner
      'RUN_SECRET_SCAN',         // secrets scanner
      'DISCOVER_RISKY_FUNCTIONS' // auth/pii/auth-boundary
    ],
  },
  {
    category: 'LAUNCH_READINESS',
    label: 'Launch Readiness',
    weight: 10,
    // Clone failures + deploy URL reachability/redirect findings.
    measuredBy: ['CLONE_REPO', 'ANALYZE_DEPLOY_URL'],
  },
  { category: 'MAINTAINABILITY_DOCUMENTATION', label: 'Maintainability & Docs', weight: 5, measuredBy: [] },
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
