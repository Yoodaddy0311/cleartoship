// GET /api/audit-runs/:id/findings — list findings with optional severity/category filter.

import type { NextRequest } from 'next/server';
import { ListFindingsQuerySchema } from '@cleartoship/shared-types';
import { resolveCaller } from '@/lib/audit-runs/auth';
import { listFindings } from '@/lib/audit-runs/get-findings';
import { jsonError, jsonOk, logServerError } from '@/app/api/_lib/responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const caller = await resolveCaller(req);
  if (!caller) return jsonError('UNAUTHORIZED', '인증 정보가 필요합니다.', 401);
  const { id: runId } = await ctx.params;
  if (!runId) return jsonError('INVALID_INPUT', 'runId가 필요합니다.', 400);

  const url = new URL(req.url);
  const queryRaw = {
    severity: url.searchParams.get('severity') ?? undefined,
    category: url.searchParams.get('category') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
    cursor: url.searchParams.get('cursor') ?? undefined,
  };
  const parsed = ListFindingsQuerySchema.safeParse(queryRaw);
  if (!parsed.success) {
    return jsonError('INVALID_INPUT', '쿼리 파라미터 형식이 올바르지 않습니다.', 400, {
      issues: parsed.error.flatten(),
    });
  }

  try {
    const result = await listFindings(runId, caller.uid, parsed.data);
    if (!result) return jsonError('NOT_FOUND', '해당 AuditRun을 찾을 수 없습니다.', 404);
    return jsonOk({ findings: result.findings, nextCursor: result.nextCursor });
  } catch (err) {
    logServerError(`GET /api/audit-runs/${runId}/findings`, err);
    return jsonError('INTERNAL', 'Findings 조회 중 오류가 발생했습니다.', 500);
  }
}
