// POST /api/audit-runs — create a new AuditRun.

import type { NextRequest } from 'next/server';
import { CreateAuditRunRequestSchema } from '@cleartoship/shared-types';
import { resolveCaller } from '@/lib/audit-runs/auth';
import { createAuditRun } from '@/lib/audit-runs/create-audit-run';
import { touchUserDoc } from '@/lib/audit-runs/touch-user-doc';
import { validateDeployUrl } from '@/lib/validation/deploy-url';
import { jsonError, jsonOk, logServerError } from '@/app/api/_lib/responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const caller = await resolveCaller(req);
  if (!caller) {
    return jsonError('UNAUTHORIZED', '인증 정보가 필요합니다.', 401);
  }

  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return jsonError('INVALID_INPUT', '요청 본문이 올바른 JSON이 아닙니다.', 400);
  }

  const parsed = CreateAuditRunRequestSchema.safeParse(bodyJson);
  if (!parsed.success) {
    return jsonError('INVALID_INPUT', '입력 유효성 검사 실패', 400, {
      issues: parsed.error.flatten(),
    });
  }

  // SSRF safety net (Item #13): zod only checks URL syntax; validateDeployUrl
  // additionally peels IP literals AND resolves the hostname to reject DNS
  // rebinding attacks where a public domain maps to a private/loopback IP.
  // createAuditRun also runs the sync parseDeployUrl, but we surface DNS-level
  // rejections at the API boundary as a 400 rather than a 500.
  if (parsed.data.deployUrl) {
    try {
      await validateDeployUrl(parsed.data.deployUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : '배포 URL 검증 실패';
      return jsonError('INVALID_INPUT', message, 400);
    }
  }

  try {
    const result = await createAuditRun(parsed.data, { ownerId: caller.uid });
    // Best-effort denormalize for daily-cleanup (Item #15 option a). A failure
    // here must not block the audit-run create, so we swallow + log only.
    touchUserDoc({ uid: caller.uid, isAnonymous: caller.isAnonymous }).catch(
      (err) => logServerError('touchUserDoc (post audit-run)', err),
    );
    return jsonOk(result, 201);
  } catch (err) {
    logServerError('POST /api/audit-runs', err);
    return jsonError('INTERNAL', 'AuditRun을 생성하지 못했습니다.', 500);
  }
}
