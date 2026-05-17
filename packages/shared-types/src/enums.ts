import { z } from 'zod';

/**
 * AuditRun lifecycle states.
 * Mirrors prisma enum AuditRunStatus in `09_data_model_api_spec.md`.
 */
export const AuditRunStatus = z.enum([
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);
export type AuditRunStatus = z.infer<typeof AuditRunStatus>;

/**
 * Audit categories from `03_audit_checklist_scoring_rubric.md` (10 base) +
 * BUSINESS_READINESS (T2.8/UPG-06). MAINTAINABILITY_DOCUMENTATION is kept for
 * completeness — UI displays main 10, but workers may emit findings against
 * it. BUSINESS_READINESS surfaces Pricing/Legal/Onboarding/Support/Analytics
 * sub-categories; weight is 0 (Phase 1) so the existing weight-sum=100
 * invariant is preserved.
 */
export const AuditCategory = z.enum([
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
  'MAINTAINABILITY_DOCUMENTATION',
  'BUSINESS_READINESS',
]);
export type AuditCategory = z.infer<typeof AuditCategory>;

/** Severity ladder — P0 (blocker) → P3 (long-tail polish). */
export const Severity = z.enum(['P0', 'P1', 'P2', 'P3']);
export type Severity = z.infer<typeof Severity>;

/** Confidence in a finding's accuracy (drives UI badges + auto-classification). */
export const Confidence = z.enum(['HIGH', 'MEDIUM', 'LOW']);
export type Confidence = z.infer<typeof Confidence>;

export const FindingStatus = z.enum([
  'OPEN',
  'ACKNOWLEDGED',
  'RESOLVED',
  'FALSE_POSITIVE',
]);
export type FindingStatus = z.infer<typeof FindingStatus>;

export const EvidenceType = z.enum([
  'FILE',
  'CODE_SNIPPET',
  'ROUTE',
  'API',
  'DOM',
  'SCREENSHOT',
  'LIGHTHOUSE',
  'AXE',
  'SEMGREP',
  'OSV',
  'SECRET_SCAN',
  'TOOL_OUTPUT',
]);
export type EvidenceType = z.infer<typeof EvidenceType>;

/** 11 feature-graph node types — `04_feature_graph_spec.md` §3. */
export const FeatureNodeType = z.enum([
  'product_area',
  'feature',
  'page',
  'component',
  'action',
  'api',
  'data_model',
  'external_service',
  'auth_guard',
  'state',
  'recommended_feature',
]);
export type FeatureNodeType = z.infer<typeof FeatureNodeType>;

/** 11 feature-graph edge types — `04_feature_graph_spec.md` §4. */
export const FeatureEdgeType = z.enum([
  'contains',
  'renders',
  'navigates_to',
  'triggers',
  'calls_api',
  'reads_from',
  'writes_to',
  'requires_auth',
  'depends_on',
  'missing_link',
  'recommended_connection',
]);
export type FeatureEdgeType = z.infer<typeof FeatureEdgeType>;

/** 9 implementation statuses — `04_feature_graph_spec.md` §5. */
export const ImplementationStatus = z.enum([
  'complete',
  'partial',
  'ui_only',
  'logic_only',
  'missing_connection',
  'missing',
  'risky',
  'recommended',
  'unknown',
]);
export type ImplementationStatus = z.infer<typeof ImplementationStatus>;
