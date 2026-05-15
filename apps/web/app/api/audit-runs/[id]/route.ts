// GET /api/audit-runs/:id — fetch AuditRun status.

import type { NextRequest } from 'next/server';
import { resolveCaller } from '@/lib/audit-runs/auth';
import { getAuditRun } from '@/lib/audit-runs/get-audit-run';
import { jsonError, jsonOk, logServerError } from '@/app/api/_lib/responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const caller = await resolveCaller(req);
  if (!caller) {
    return jsonError('UNAUTHORIZED', '인증 정보가 필요합니다.', 401);
  }
  const runId = ctx.params.id;
  if (!runId) return jsonError('INVALID_INPUT', 'runId가 필요합니다.', 400);

  try {
    const run = await getAuditRun(runId, caller.uid);
    if (!run) return jsonError('NOT_FOUND', '해당 AuditRun을 찾을 수 없습니다.', 404);
    return jsonOk(run as unknown as Record<string, unknown>);
  } catch (err) {
    logServerError(`GET /api/audit-runs/${runId}`, err);
    return jsonError('INTERNAL', 'AuditRun 조회 중 오류가 발생했습니다.', 500);
  }
}
