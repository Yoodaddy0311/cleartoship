// GET /api/audit-runs/:id/feature-graph

import type { NextRequest } from 'next/server';
import { resolveCaller } from '@/lib/audit-runs/auth';
import { getFeatureGraph } from '@/lib/audit-runs/get-feature-graph';
import { jsonError, jsonOk, logServerError } from '@/app/api/_lib/responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const caller = await resolveCaller(req);
  if (!caller) return jsonError('UNAUTHORIZED', '인증 정보가 필요합니다.', 401);
  const runId = ctx.params.id;
  if (!runId) return jsonError('INVALID_INPUT', 'runId가 필요합니다.', 400);

  try {
    const graph = await getFeatureGraph(runId, caller.uid);
    if (!graph) return jsonError('NOT_FOUND', '기능 관계도가 아직 생성되지 않았습니다.', 404);
    return jsonOk(graph as unknown as Record<string, unknown>);
  } catch (err) {
    logServerError(`GET /api/audit-runs/${runId}/feature-graph`, err);
    return jsonError('INTERNAL', '기능 관계도 조회 중 오류가 발생했습니다.', 500);
  }
}
