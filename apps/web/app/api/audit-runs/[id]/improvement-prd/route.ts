// GET /api/audit-runs/:id/improvement-prd

import type { NextRequest } from 'next/server';
import { resolveCaller } from '@/lib/audit-runs/auth';
import { getImprovementPrd } from '@/lib/audit-runs/get-improvement-prd';
import { jsonError, jsonOk, logServerError } from '@/app/api/_lib/responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const caller = await resolveCaller(req);
  if (!caller) return jsonError('UNAUTHORIZED', '인증 정보가 필요합니다.', 401);
  const { id: runId } = await ctx.params;
  if (!runId) return jsonError('INVALID_INPUT', 'runId가 필요합니다.', 400);

  try {
    const prd = await getImprovementPrd(runId, caller.uid);
    if (!prd) return jsonError('NOT_FOUND', '개선 PRD가 아직 생성되지 않았습니다.', 404);
    return jsonOk(prd as unknown as Record<string, unknown>);
  } catch (err) {
    logServerError(`GET /api/audit-runs/${runId}/improvement-prd`, err);
    return jsonError('INTERNAL', '개선 PRD 조회 중 오류가 발생했습니다.', 500);
  }
}
