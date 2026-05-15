// GET /api/findings/:id?runId=... — fetch a finding + its evidences.
//
// Findings live under /auditRuns/{runId}/findings/{id}; the finding id alone
// does not contain its parent run id, so the caller must pass runId in the
// query string. (Frontend always has both ids at navigation time.)

import type { NextRequest } from 'next/server';
import { resolveCaller } from '@/lib/audit-runs/auth';
import { getFinding } from '@/lib/audit-runs/get-findings';
import { jsonError, jsonOk, logServerError } from '@/app/api/_lib/responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const caller = await resolveCaller(req);
  if (!caller) return jsonError('UNAUTHORIZED', '인증 정보가 필요합니다.', 401);
  const findingId = ctx.params.id;
  const runId = new URL(req.url).searchParams.get('runId');
  if (!findingId) return jsonError('INVALID_INPUT', 'findingId가 필요합니다.', 400);
  if (!runId) return jsonError('INVALID_INPUT', 'runId 쿼리 파라미터가 필요합니다.', 400);

  try {
    const result = await getFinding(runId, findingId, caller.uid);
    if (!result) return jsonError('NOT_FOUND', '해당 Finding을 찾을 수 없습니다.', 404);
    return jsonOk({ finding: result.finding, evidences: result.evidences });
  } catch (err) {
    logServerError(`GET /api/findings/${findingId}`, err);
    return jsonError('INTERNAL', 'Finding 조회 중 오류가 발생했습니다.', 500);
  }
}
