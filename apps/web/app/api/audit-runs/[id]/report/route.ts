// GET /api/audit-runs/:id/report

import type { NextRequest } from 'next/server';
import { resolveCaller } from '@/lib/audit-runs/auth';
import { getReport } from '@/lib/audit-runs/get-report';
import { jsonError, jsonOk, logServerError } from '@/app/api/_lib/responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const caller = await resolveCaller(req);
  if (!caller) return jsonError('UNAUTHORIZED', '인증 정보가 필요합니다.', 401);
  const runId = ctx.params.id;
  if (!runId) return jsonError('INVALID_INPUT', 'runId가 필요합니다.', 400);

  try {
    const report = await getReport(runId, caller.uid);
    if (!report) return jsonError('NOT_FOUND', '리포트가 아직 생성되지 않았습니다.', 404);
    return jsonOk(report as unknown as Record<string, unknown>);
  } catch (err) {
    logServerError(`GET /api/audit-runs/${runId}/report`, err);
    return jsonError('INTERNAL', '리포트 조회 중 오류가 발생했습니다.', 500);
  }
}
