import type {
  CreateAuditRunResponse,
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

export interface AuditRunDto {
  id: string;
  status: AuditRunStatus;
  currentStep: string;
  progress: number;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
}

export type { CreateAuditRunResponse };

export async function createAuditRun(
  input: AuditRunCreateInput
): Promise<CreateAuditRunResponse> {
  return apiFetch<CreateAuditRunResponse>('/api/audit-runs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getAuditRun(id: string): Promise<AuditRunDto> {
  return apiFetch<AuditRunDto>(`/api/audit-runs/${encodeURIComponent(id)}`);
}

export async function cancelAuditRun(id: string): Promise<void> {
  return apiFetch<void>(`/api/audit-runs/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  });
}
