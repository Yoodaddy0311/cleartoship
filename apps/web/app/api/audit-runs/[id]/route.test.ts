// Integration tests for GET /api/audit-runs/:id.
//
// Branches covered:
//   1. Auth fail (resolveCaller null)       → 401
//   2. Missing path param (runId empty)     → 400
//   3. getAuditRun returns null (not-found
//      OR forbidden — both collapse to 404) → 404
//   4. Normal success                       → 200 with the AuditRun payload
//   5. Service throws                       → 500
//
// Ownership enforcement lives inside getAuditRun (returns null if
// ownerId !== caller.uid), so the route returns 404 in that case — there is
// no explicit 403 path at the route layer. We still exercise that branch via
// the same null-return mock to lock in the contract.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const { resolveCallerMock } = vi.hoisted(() => ({ resolveCallerMock: vi.fn() }));
const { getAuditRunMock } = vi.hoisted(() => ({ getAuditRunMock: vi.fn() }));

vi.mock('@/lib/audit-runs/auth', () => ({
  resolveCaller: resolveCallerMock,
}));

vi.mock('@/lib/audit-runs/get-audit-run', () => ({
  getAuditRun: getAuditRunMock,
}));

function makeReq(headers: Record<string, string> = {}): NextRequest {
  const h = new Map(Object.entries(headers));
  return {
    headers: { get: (k: string) => h.get(k.toLowerCase()) ?? h.get(k) ?? null },
    url: 'http://localhost/api/audit-runs/run-1',
  } as unknown as NextRequest;
}

describe('GET /api/audit-runs/:id', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resolveCallerMock.mockResolvedValue({ uid: 'user-1', isAnonymous: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 UNAUTHORIZED when resolveCaller returns null', async () => {
    resolveCallerMock.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/audit-runs/[id]/route');
    const res = await GET(makeReq(), { params: { id: 'run-1' } });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(getAuditRunMock).not.toHaveBeenCalled();
  });

  it('returns 400 INVALID_INPUT when path param id is empty', async () => {
    const { GET } = await import('@/app/api/audit-runs/[id]/route');
    const res = await GET(makeReq({ authorization: 'Bearer fake' }), { params: { id: '' } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_INPUT');
    expect(getAuditRunMock).not.toHaveBeenCalled();
  });

  it('returns 404 NOT_FOUND when getAuditRun returns null (ownership or missing)', async () => {
    getAuditRunMock.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/audit-runs/[id]/route');
    const res = await GET(makeReq({ authorization: 'Bearer fake' }), {
      params: { id: 'run-1' },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(getAuditRunMock).toHaveBeenCalledWith('run-1', 'user-1');
  });

  it('returns 200 with the AuditRun payload on the happy path', async () => {
    const auditRun = {
      id: 'run-1',
      projectId: 'proj-1',
      ownerId: 'user-1',
      status: 'COMPLETED',
      repoUrl: 'https://github.com/owner/repo',
    };
    getAuditRunMock.mockResolvedValueOnce(auditRun);
    const { GET } = await import('@/app/api/audit-runs/[id]/route');
    const res = await GET(makeReq({ authorization: 'Bearer fake' }), {
      params: { id: 'run-1' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(auditRun);
    expect(getAuditRunMock).toHaveBeenCalledWith('run-1', 'user-1');
  });

  it('returns 500 INTERNAL when getAuditRun throws', async () => {
    getAuditRunMock.mockRejectedValueOnce(new Error('firestore down'));
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { GET } = await import('@/app/api/audit-runs/[id]/route');
    const res = await GET(makeReq({ authorization: 'Bearer fake' }), {
      params: { id: 'run-1' },
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL');
    stderrSpy.mockRestore();
  });
});
