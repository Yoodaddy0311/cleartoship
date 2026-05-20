// POST /api/audit-runs — create a new AuditRun.
// GET  /api/audit-runs — list the caller's recent AuditRuns (newest first).

import { NextResponse, type NextRequest } from 'next/server';
import { CreateAuditRunRequestSchema, makeError } from '@cleartoship/shared-types';
import { resolveCaller } from '@/lib/audit-runs/auth';
import {
  createAuditRun,
  DailyQuotaExceededError,
  PerIpRateLimitError,
  PrdTextTooLargeError,
  PRD_TEXT_USER_MAX_BYTES,
} from '@/lib/audit-runs/create-audit-run';
import { listAuditRuns } from '@/lib/audit-runs/list-audit-runs';
import { touchUserDoc } from '@/lib/audit-runs/touch-user-doc';
import { validateDeployUrl } from '@/lib/validation/deploy-url';
import { jsonError, jsonOk, logServerError } from '@/app/api/_lib/responses';

const LIST_LIMIT_MIN = 1;
const LIST_LIMIT_MAX = 100;
const LIST_LIMIT_DEFAULT = 50;

/**
 * Extracts the originating client IP from proxy/CDN headers. Cloud Run sets
 * `x-forwarded-for` as a comma-separated chain (client, proxy1, ...); we take
 * the first hop. Cloudflare additionally sets `cf-connecting-ip` which we use
 * as fallback. Returns null when nothing usable is present (e.g. local dev
 * curl) — the per-IP guardrail buckets all such requests under a shared
 * "unknown" sentinel so abuse via unconfigured environments still rate-limits.
 */
function extractClientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff && xff.trim().length > 0) return xff;
  const cf = req.headers.get('cf-connecting-ip');
  if (cf && cf.trim().length > 0) return cf;
  return null;
}

/**
 * Seconds remaining until the next UTC midnight bucket rollover. Used as the
 * `Retry-After` header value when the daily quota is exhausted, so well-behaved
 * clients (and CDNs) back off until the quota refills.
 */
function secondsUntilUtcMidnight(now: Date = new Date()): number {
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    ),
  );
  const diffMs = next.getTime() - now.getTime();
  return Math.max(1, Math.ceil(diffMs / 1000));
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const caller = await resolveCaller(req);
  if (!caller) {
    return jsonError('UNAUTHORIZED', '인증 정보가 필요합니다.', 401);
  }

  // `limit` is the only query parameter — clamp to [1, 100] and fall back to
  // the default on missing / unparseable input. We do not support cursor
  // pagination yet (see list-audit-runs.ts rationale) so callers requesting
  // more than 100 are bounded rather than rejected.
  const rawLimit = req.nextUrl.searchParams.get('limit');
  let limit = LIST_LIMIT_DEFAULT;
  if (rawLimit !== null) {
    const parsed = Number.parseInt(rawLimit, 10);
    if (!Number.isFinite(parsed)) {
      return jsonError('INVALID_INPUT', 'limit은 정수여야 합니다.', 400);
    }
    limit = Math.min(LIST_LIMIT_MAX, Math.max(LIST_LIMIT_MIN, parsed));
  }

  try {
    const runs = await listAuditRuns(caller.uid, { limit });
    return jsonOk({ runs, count: runs.length, limit });
  } catch (err) {
    logServerError('GET /api/audit-runs', err);
    return jsonError('INTERNAL', 'AuditRun 목록을 조회하지 못했습니다.', 500);
  }
}

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
    const clientIp = extractClientIp(req);
    const result = await createAuditRun(parsed.data, {
      ownerId: caller.uid,
      clientIp,
    });
    // Best-effort denormalize for daily-cleanup (Item #15 option a). A failure
    // here must not block the audit-run create, so we swallow + log only.
    touchUserDoc({ uid: caller.uid, isAnonymous: caller.isAnonymous }).catch(
      (err) => logServerError('touchUserDoc (post audit-run)', err),
    );
    return jsonOk(result, 201);
  } catch (err) {
    // W2-A: 사용자 PRD 50KB cap 초과 → 422 Unprocessable Entity.
    // UI 가 동일한 한도(50KB)로 사전 차단하지만, API 직접 호출(curl, 외부 봇)
    // 우회를 막기 위한 server-side 가드. details.actualBytes 로 클라이언트가
    // "현재 N바이트 / 최대 50,000바이트" 메시지를 정확히 렌더 가능.
    if (err instanceof PrdTextTooLargeError) {
      // ErrorCode 는 shared-types 의 고정 enum 이라 신규 코드 추가 대신 기존
      // 'INVALID_INPUT' + details.reason 디스크리미네이터 패턴을 따른다
      // (rate-limit 의 'RATE_LIMITED_PER_IP' / 'DAILY_QUOTA_EXCEEDED' 와 동일
      // 컨벤션). 클라이언트는 reason 으로 분기.
      const body = makeError(
        'INVALID_INPUT',
        `PRD 본문이 ${PRD_TEXT_USER_MAX_BYTES.toLocaleString()}바이트를 초과했습니다 (현재 ${err.actualBytes.toLocaleString()}바이트).`,
        {
          reason: 'PRD_TEXT_TOO_LARGE',
          maxBytes: PRD_TEXT_USER_MAX_BYTES,
          actualBytes: err.actualBytes,
        },
      );
      return NextResponse.json(body, { status: 422 });
    }

    // T1.1a per-IP rate limit cap reached → 429 Too Many Requests with a
    // `Retry-After` header pointing at the next minute boundary. Distinct from
    // the daily-quota branch below: per-IP is a short backoff, daily quota
    // is a 24h backoff. The client renders different copy based on
    // `details.reason` ('RATE_LIMITED_PER_IP' vs 'DAILY_QUOTA_EXCEEDED').
    if (err instanceof PerIpRateLimitError) {
      const body = makeError(
        'RATE_LIMITED',
        `요청이 너무 자주 발생했습니다. ${err.retryAfterSeconds}초 후 다시 시도해 주세요.`,
        {
          reason: 'RATE_LIMITED_PER_IP',
          bucketId: err.bucketId,
          count: err.count,
          max: err.max,
          retryAfterSeconds: err.retryAfterSeconds,
        },
      );
      return NextResponse.json(body, {
        status: 429,
        headers: { 'Retry-After': String(err.retryAfterSeconds) },
      });
    }

    // T1.1c daily quota cap reached → 429 Too Many Requests with a
    // `Retry-After` header pointing at the next UTC midnight bucket rollover.
    // Structured details let the client render "오늘 분석 한도 도달" instead of
    // a generic 5xx. We use 429 (not 503) because the limit is intentional and
    // client-driven, not a transient server failure.
    if (err instanceof DailyQuotaExceededError) {
      const retryAfter = secondsUntilUtcMidnight();
      const body = makeError(
        'RATE_LIMITED',
        `오늘 전체 분석 한도(${err.max}건)에 도달했습니다. UTC 자정 이후 다시 시도해 주세요.`,
        {
          reason: 'DAILY_QUOTA_EXCEEDED',
          bucketId: err.bucketId,
          count: err.count,
          max: err.max,
          retryAfterSeconds: retryAfter,
        },
      );
      return NextResponse.json(body, {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      });
    }
    logServerError('POST /api/audit-runs', err);
    return jsonError('INTERNAL', 'AuditRun을 생성하지 못했습니다.', 500);
  }
}
