// GET /api/audit-runs/:id/evidences — run-scoped evidence list.
//
// Single round-trip used by the feature-graph page to map node `evidenceIds`
// to owning finding ids, replacing the previous per-finding `getFinding` N+1
// loop.

import type { NextRequest } from 'next/server';
import { resolveCaller } from '@/lib/audit-runs/auth';
import { listEvidencesForRun } from '@/lib/audit-runs/get-findings';
import { jsonError, jsonOk, logServerError } from '@/app/api/_lib/responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const caller = await resolveCaller(req);
  if (!caller) return jsonError('UNAUTHORIZED', '인증 정보가 필요합니다.', 401);
  const { id: runId } = await ctx.params;
  if (!runId) return jsonError('INVALID_INPUT', 'runId가 필요합니다.', 400);

  try {
    const result = await listEvidencesForRun(runId, caller.uid);
    if (!result) return jsonError('NOT_FOUND', '해당 AuditRun을 찾을 수 없습니다.', 404);
    return jsonOk({ evidences: result.evidences, truncated: result.truncated });
  } catch (err) {
    logServerError(`GET /api/audit-runs/${runId}/evidences`, err);
    return jsonError('INTERNAL', 'Evidences 조회 중 오류가 발생했습니다.', 500);
  }
}
