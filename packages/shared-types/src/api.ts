import { z } from 'zod';
import {
  AuditRunSchema,
  EvidenceSchema,
  FeatureGraphSchema,
  FindingSchema,
  AuditReportSchema,
  ImprovementPrdSchema,
} from './domain.js';
import { AuditCategory, Severity } from './enums.js';

// ---------------------------------------------------------------------------
// Structured error envelope (used by all 7 API endpoints)
// ---------------------------------------------------------------------------

export const ErrorCodeSchema = z.enum([
  'INVALID_INPUT',
  'NOT_FOUND',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL',
  'UPSTREAM_FAILURE',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorBodySchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

export interface ApiError extends ErrorBody {}

// Helper for handler authors.
export function makeError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ErrorBody {
  return details === undefined
    ? { error: { code, message } }
    : { error: { code, message, details } };
}

// ---------------------------------------------------------------------------
// POST /api/audit-runs
// ---------------------------------------------------------------------------

export const CreateAuditRunRequestSchema = z.object({
  repoUrl: z
    .string()
    .url()
    .regex(/^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/i, {
      message: 'GitHub repo URL 형식이 아닙니다 (https://github.com/owner/repo).',
    }),
  deployUrl: z.string().url().nullable().optional(),
  prdText: z.string().max(50_000).nullable().optional(),
});
export type CreateAuditRunRequest = z.infer<typeof CreateAuditRunRequestSchema>;

export const CreateAuditRunResponseSchema = z.object({
  auditRunId: z.string(),
  projectId: z.string(),
  status: z.literal('PENDING'),
});
export type CreateAuditRunResponse = z.infer<typeof CreateAuditRunResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/audit-runs/:id
// ---------------------------------------------------------------------------

export const GetAuditRunResponseSchema = AuditRunSchema;
export type GetAuditRunResponse = z.infer<typeof GetAuditRunResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/audit-runs/:id/findings
// ---------------------------------------------------------------------------

export const ListFindingsQuerySchema = z.object({
  severity: Severity.optional(),
  category: AuditCategory.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50).optional(),
  cursor: z.string().optional(),
});
export type ListFindingsQuery = z.infer<typeof ListFindingsQuerySchema>;

export const ListFindingsResponseSchema = z.object({
  findings: z.array(FindingSchema),
  nextCursor: z.string().nullable(),
});
export type ListFindingsResponse = z.infer<typeof ListFindingsResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/findings/:id
// ---------------------------------------------------------------------------

export const GetFindingResponseSchema = z.object({
  finding: FindingSchema,
  evidences: z.array(EvidenceSchema),
});
export type GetFindingResponse = z.infer<typeof GetFindingResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/audit-runs/:id/feature-graph
// ---------------------------------------------------------------------------

export const GetFeatureGraphResponseSchema = FeatureGraphSchema;
export type GetFeatureGraphResponse = z.infer<typeof GetFeatureGraphResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/audit-runs/:id/report
// ---------------------------------------------------------------------------

export const GetReportResponseSchema = AuditReportSchema;
export type GetReportResponse = z.infer<typeof GetReportResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/audit-runs/:id/improvement-prd
// ---------------------------------------------------------------------------

export const GetImprovementPrdResponseSchema = ImprovementPrdSchema;
export type GetImprovementPrdResponse = z.infer<typeof GetImprovementPrdResponseSchema>;

// ---------------------------------------------------------------------------
// Cloud Tasks payload (internal contract)
// ---------------------------------------------------------------------------

export const AuditTaskPayloadSchema = z.object({
  runId: z.string(),
  projectId: z.string(),
  ownerId: z.string(),
  repoUrl: z.string().url(),
  deployUrl: z.string().url().nullable(),
  prdText: z.string().nullable(),
  commitHash: z.string().nullable(),
});
export type AuditTaskPayload = z.infer<typeof AuditTaskPayloadSchema>;
