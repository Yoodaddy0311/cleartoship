import {
  AuditRunSchema,
  FeatureGraphSchema,
  GetFindingResponseSchema,
  ListFindingsResponseSchema,
  AuditReportSchema,
  ImprovementPrdSchema,
  type AuditRun,
  type CreateAuditRunResponse,
  type EnqueueMode,
  type FeatureGraph,
  type GetFindingResponse,
  type ListFindingsQuery,
  type ListFindingsResponse,
  type AuditReport,
  type ImprovementPRD,
} from '@cleartoship/shared-types';
import { apiFetch } from './client';

export type AuditRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface AuditRunCreateInput {
  repoUrl: string;
  deployUrl?: string;
  prdText?: string;
}

/**
 * Lightweight progress DTO — used by the polling hook on the progress page.
 * Fields are a subset of AuditRun: the hook only needs status/progress info.
 */
export interface AuditRunDto {
  id: string;
  status: AuditRunStatus;
  currentStep: string | null;
  progress: number;
  enqueueMode: EnqueueMode | null;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
}

export type {
  AuditRun,
  AuditReport,
  CreateAuditRunResponse,
  EnqueueMode,
  FeatureGraph,
  GetFindingResponse,
  ImprovementPRD,
  ListFindingsQuery,
  ListFindingsResponse,
};

export async function createAuditRun(
  input: AuditRunCreateInput
): Promise<CreateAuditRunResponse> {
  return apiFetch<CreateAuditRunResponse>('/api/audit-runs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * Full AuditRun — validated against AuditRunSchema. The polling hook narrows
 * the response itself; pages that need full fields should use this directly.
 */
export async function getAuditRun(id: string): Promise<AuditRun> {
  const raw = await apiFetch<unknown>(
    `/api/audit-runs/${encodeURIComponent(id)}`
  );
  return AuditRunSchema.parse(raw);
}

export async function cancelAuditRun(id: string): Promise<void> {
  return apiFetch<void>(`/api/audit-runs/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  });
}

export async function getReport(id: string): Promise<AuditReport> {
  const raw = await apiFetch<unknown>(
    `/api/audit-runs/${encodeURIComponent(id)}/report`
  );
  return AuditReportSchema.parse(raw);
}

export async function getFeatureGraph(id: string): Promise<FeatureGraph> {
  const raw = await apiFetch<unknown>(
    `/api/audit-runs/${encodeURIComponent(id)}/feature-graph`
  );
  return FeatureGraphSchema.parse(raw);
}

export async function getImprovementPrd(id: string): Promise<ImprovementPRD> {
  const raw = await apiFetch<unknown>(
    `/api/audit-runs/${encodeURIComponent(id)}/improvement-prd`
  );
  return ImprovementPrdSchema.parse(raw);
}

export async function listFindings(
  id: string,
  query?: ListFindingsQuery
): Promise<ListFindingsResponse> {
  const params = new URLSearchParams();
  if (query?.severity) params.set('severity', query.severity);
  if (query?.category) params.set('category', query.category);
  if (query?.limit !== undefined) params.set('limit', String(query.limit));
  if (query?.cursor) params.set('cursor', query.cursor);
  const qs = params.toString();
  const raw = await apiFetch<unknown>(
    `/api/audit-runs/${encodeURIComponent(id)}/findings${qs ? `?${qs}` : ''}`
  );
  return ListFindingsResponseSchema.parse(raw);
}

export async function getFinding(
  findingId: string,
  runId: string
): Promise<GetFindingResponse> {
  const raw = await apiFetch<unknown>(
    `/api/findings/${encodeURIComponent(findingId)}?runId=${encodeURIComponent(runId)}`
  );
  return GetFindingResponseSchema.parse(raw);
}
