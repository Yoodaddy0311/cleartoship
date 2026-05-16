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

vi.mock('@/lib/audit-runs/create-audit-run', () => ({
  createAuditRun: createAuditRunMock,
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
      { ownerId: 'user-1' },
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
