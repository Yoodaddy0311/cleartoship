// Integration tests for POST /api/audit-runs.
//
// Covers the 4 standard branches per the api-tests team contract:
//   1. Auth fail (resolveCaller returns null) → 401
//   2. Input validation fail (Zod) → 400
//   3. Body parse fail (invalid JSON) → 400
//   4. Normal success path → 201 with shape { auditRunId, projectId, status }
//
// Only external dependencies are mocked (resolveCaller, createAuditRun,
// touchUserDoc, validateDeployUrl). The route handler's branching is exercised
// against real Zod schemas + real NextResponse construction.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const { resolveCallerMock } = vi.hoisted(() => ({ resolveCallerMock: vi.fn() }));
const { createAuditRunMock } = vi.hoisted(() => ({ createAuditRunMock: vi.fn() }));
const { touchUserDocMock } = vi.hoisted(() => ({ touchUserDocMock: vi.fn() }));
const { validateDeployUrlMock } = vi.hoisted(() => ({ validateDeployUrlMock: vi.fn() }));

vi.mock('@/lib/audit-runs/auth', () => ({
  resolveCaller: resolveCallerMock,
}));

// Hoisted stand-ins for the route handler's `err instanceof X` checks so the
// route catches our test errors as if they were the real classes. Importing
// the real module here would pull firebase-admin into the unit-test runtime,
// so we redeclare structurally identical classes.
const {
  TestDailyQuotaExceededError,
  TestPerIpRateLimitError,
  TestPrdTextTooLargeError,
} = vi.hoisted(() => {
  class TestDailyQuotaExceededError extends Error {
    readonly bucketId: string;
    readonly count: number;
    readonly max: number;
    constructor(args: { bucketId: string; count: number; max: number }) {
      super(`Daily audit quota exceeded for ${args.bucketId}.`);
      this.name = 'DailyQuotaExceededError';
      this.bucketId = args.bucketId;
      this.count = args.count;
      this.max = args.max;
    }
  }
  class TestPerIpRateLimitError extends Error {
    readonly ipKey: string;
    readonly bucketId: string;
    readonly count: number;
    readonly max: number;
    readonly retryAfterSeconds: number;
    constructor(args: {
      ipKey: string;
      bucketId: string;
      count: number;
      max: number;
      retryAfterSeconds: number;
    }) {
      super(`Per-IP rate limit exceeded for ${args.ipKey}.`);
      this.name = 'PerIpRateLimitError';
      this.ipKey = args.ipKey;
      this.bucketId = args.bucketId;
      this.count = args.count;
      this.max = args.max;
      this.retryAfterSeconds = args.retryAfterSeconds;
    }
  }
  // W2-A: 사용자 PRD 50KB cap 초과 시 throw 되는 에러. route 가
  // `err instanceof PrdTextTooLargeError` 로 분기하므로 구조적으로 동일한
  // 클래스를 mock 에 노출해야 한다.
  class TestPrdTextTooLargeError extends Error {
    readonly actualBytes: number;
    readonly maxBytes: number;
    constructor(actualBytes: number, maxBytes = 50_000) {
      super(`prdText exceeds user cap (${actualBytes} > ${maxBytes} bytes).`);
      this.name = 'PrdTextTooLargeError';
      this.actualBytes = actualBytes;
      this.maxBytes = maxBytes;
    }
  }
  return {
    TestDailyQuotaExceededError,
    TestPerIpRateLimitError,
    TestPrdTextTooLargeError,
  };
});

vi.mock('@/lib/audit-runs/create-audit-run', () => ({
  createAuditRun: createAuditRunMock,
  DailyQuotaExceededError: TestDailyQuotaExceededError,
  PerIpRateLimitError: TestPerIpRateLimitError,
  PrdTextTooLargeError: TestPrdTextTooLargeError,
  PRD_TEXT_USER_MAX_BYTES: 50_000,
}));

vi.mock('@/lib/audit-runs/touch-user-doc', () => ({
  touchUserDoc: touchUserDocMock,
}));

vi.mock('@/lib/validation/deploy-url', () => ({
  validateDeployUrl: validateDeployUrlMock,
}));

function makeReq(body: unknown, headers: Record<string, string> = {}): NextRequest {
  const h = new Map(Object.entries(headers));
  return {
    headers: { get: (k: string) => h.get(k.toLowerCase()) ?? h.get(k) ?? null },
    json: async () => {
      if (body instanceof Error) throw body;
      return body;
    },
  } as unknown as NextRequest;
}

describe('POST /api/audit-runs', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resolveCallerMock.mockResolvedValue({ uid: 'user-1', isAnonymous: false });
    createAuditRunMock.mockResolvedValue({
      auditRunId: 'run-1',
      projectId: 'proj-1',
      status: 'PENDING',
    });
    touchUserDocMock.mockResolvedValue(undefined);
    validateDeployUrlMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 UNAUTHORIZED when resolveCaller returns null', async () => {
    resolveCallerMock.mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/audit-runs/route');
    const req = makeReq({ repoUrl: 'https://github.com/owner/repo' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(createAuditRunMock).not.toHaveBeenCalled();
  });

  it('returns 400 INVALID_INPUT when request body is not valid JSON', async () => {
    const { POST } = await import('@/app/api/audit-runs/route');
    // Force json() to throw — simulates malformed JSON.
    const req = makeReq(new SyntaxError('Unexpected token'), {
      authorization: 'Bearer fake',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_INPUT');
    expect(createAuditRunMock).not.toHaveBeenCalled();
  });

  it('returns 400 INVALID_INPUT when Zod schema rejects payload (missing repoUrl)', async () => {
    const { POST } = await import('@/app/api/audit-runs/route');
    const req = makeReq({ deployUrl: 'https://example.com' }, { authorization: 'Bearer fake' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_INPUT');
    expect(body.error.details).toBeDefined();
    expect(createAuditRunMock).not.toHaveBeenCalled();
  });

  it('returns 400 INVALID_INPUT when repoUrl is not a github.com URL', async () => {
    const { POST } = await import('@/app/api/audit-runs/route');
    const req = makeReq(
      { repoUrl: 'https://gitlab.com/owner/repo' },
      { authorization: 'Bearer fake' },
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_INPUT');
    expect(createAuditRunMock).not.toHaveBeenCalled();
  });

  it('returns 201 with createAuditRun payload on the happy path', async () => {
    const { POST } = await import('@/app/api/audit-runs/route');
    const req = makeReq(
      { repoUrl: 'https://github.com/owner/repo' },
      { authorization: 'Bearer fake' },
    );
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      auditRunId: 'run-1',
      projectId: 'proj-1',
      status: 'PENDING',
    });
    expect(createAuditRunMock).toHaveBeenCalledOnce();
    expect(createAuditRunMock).toHaveBeenCalledWith(
      expect.objectContaining({ repoUrl: 'https://github.com/owner/repo' }),
      // T1.1a: route forwards clientIp (null on this request — no XFF header)
      // alongside ownerId. Use objectContaining so future option additions
      // don't churn this assertion.
      expect.objectContaining({ ownerId: 'user-1', clientIp: null }),
    );
  });

  it('returns 400 when validateDeployUrl rejects (SSRF guard at API boundary)', async () => {
    validateDeployUrlMock.mockRejectedValueOnce(new Error('사설 IP 차단됨'));
    const { POST } = await import('@/app/api/audit-runs/route');
    const req = makeReq(
      {
        repoUrl: 'https://github.com/owner/repo',
        deployUrl: 'https://attacker.example.com',
      },
      { authorization: 'Bearer fake' },
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_INPUT');
    expect(body.error.message).toMatch(/사설/);
    expect(createAuditRunMock).not.toHaveBeenCalled();
  });

  it('returns 429 RATE_LIMITED with Retry-After when per-IP rate limit is exceeded', async () => {
    // T1.1a per-IP guardrail: createAuditRun throws PerIpRateLimitError → route
    // maps to 429 + Retry-After header (seconds until next minute boundary) +
    // details.reason='RATE_LIMITED_PER_IP'. Distinct from the daily-quota
    // branch: short backoff (sub-minute) rather than 24h.
    createAuditRunMock.mockRejectedValueOnce(
      new TestPerIpRateLimitError({
        ipKey: '1.2.3.4',
        bucketId: '2026-05-17T11:30',
        count: 10,
        max: 10,
        retryAfterSeconds: 42,
      }),
    );
    const { POST } = await import('@/app/api/audit-runs/route');
    const req = makeReq(
      { repoUrl: 'https://github.com/owner/repo' },
      { authorization: 'Bearer fake', 'x-forwarded-for': '1.2.3.4' },
    );
    const res = await POST(req);

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');

    const body = await res.json();
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.message).toMatch(/요청이 너무 자주 발생/);
    expect(body.error.details).toMatchObject({
      reason: 'RATE_LIMITED_PER_IP',
      bucketId: '2026-05-17T11:30',
      count: 10,
      max: 10,
      retryAfterSeconds: 42,
    });
  });

  it('forwards x-forwarded-for first hop to createAuditRun as clientIp', async () => {
    // The route extracts client IP from x-forwarded-for / cf-connecting-ip
    // and forwards it to createAuditRun so the per-IP guardrail can key on it.
    const { POST } = await import('@/app/api/audit-runs/route');
    const req = makeReq(
      { repoUrl: 'https://github.com/owner/repo' },
      {
        authorization: 'Bearer fake',
        'x-forwarded-for': '203.0.113.7, 10.0.0.1',
      },
    );
    await POST(req);

    expect(createAuditRunMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        ownerId: 'user-1',
        clientIp: '203.0.113.7, 10.0.0.1',
      }),
    );
  });

  it('falls back to cf-connecting-ip when x-forwarded-for is missing', async () => {
    const { POST } = await import('@/app/api/audit-runs/route');
    const req = makeReq(
      { repoUrl: 'https://github.com/owner/repo' },
      {
        authorization: 'Bearer fake',
        'cf-connecting-ip': '198.51.100.42',
      },
    );
    await POST(req);

    expect(createAuditRunMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ clientIp: '198.51.100.42' }),
    );
  });

  it('returns 429 RATE_LIMITED with Retry-After header when the daily cap is reached', async () => {
    // T1.1c global daily quota: createAuditRun throws DailyQuotaExceededError
    // → route maps to 429 Too Many Requests + Retry-After header (seconds until
    // UTC midnight rollover) so the client can render "오늘 분석 한도 도달" and
    // back off until the bucket refills. 429 is the correct semantic — the
    // limit is intentional, not a transient 5xx.
    createAuditRunMock.mockRejectedValueOnce(
      new TestDailyQuotaExceededError({
        bucketId: '2026-05-17',
        count: 1000,
        max: 1000,
      }),
    );
    const { POST } = await import('@/app/api/audit-runs/route');
    const req = makeReq(
      { repoUrl: 'https://github.com/owner/repo' },
      { authorization: 'Bearer fake' },
    );
    const res = await POST(req);

    expect(res.status).toBe(429);
    const retryAfter = res.headers.get('Retry-After');
    expect(retryAfter).not.toBeNull();
    const retryAfterNum = Number(retryAfter);
    // Bucket rolls over at next UTC midnight → at most 24h*3600s, at least 1s.
    expect(retryAfterNum).toBeGreaterThanOrEqual(1);
    expect(retryAfterNum).toBeLessThanOrEqual(24 * 60 * 60);

    const body = await res.json();
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.message).toMatch(/오늘 전체 분석 한도\(1000건\)/);
    expect(body.error.details).toMatchObject({
      reason: 'DAILY_QUOTA_EXCEEDED',
      bucketId: '2026-05-17',
      count: 1000,
      max: 1000,
    });
    // retryAfterSeconds mirrors the Retry-After header so JSON-only clients
    // (e.g. fetch in the browser) don't need to read response headers.
    expect(body.error.details.retryAfterSeconds).toBe(retryAfterNum);
  });

  it('returns 500 INTERNAL when createAuditRun throws unexpectedly', async () => {
    createAuditRunMock.mockRejectedValueOnce(new Error('firestore unreachable'));
    // Silence the structured-error stderr write so the test output stays clean.
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { POST } = await import('@/app/api/audit-runs/route');
    const req = makeReq(
      { repoUrl: 'https://github.com/owner/repo' },
      { authorization: 'Bearer fake' },
    );
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL');
    stderrSpy.mockRestore();
  });
});
