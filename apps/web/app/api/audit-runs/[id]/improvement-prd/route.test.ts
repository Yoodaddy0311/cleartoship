// Integration tests for GET /api/audit-runs/:id/improvement-prd.
//
// Branches covered:
//   1. Auth fail (resolveCaller null)                    → 401
//   2. Missing path param                                → 400
//   3. getImprovementPrd returns null (not-found/own)    → 404
//   4. Normal success                                    → 200 with PRD payload
//   5. Service throws                                    → 500

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const { resolveCallerMock } = vi.hoisted(() => ({ resolveCallerMock: vi.fn() }));
const { getImprovementPrdMock } = vi.hoisted(() => ({ getImprovementPrdMock: vi.fn() }));

vi.mock('@/lib/audit-runs/auth', () => ({
  resolveCaller: resolveCallerMock,
}));

vi.mock('@/lib/audit-runs/get-improvement-prd', () => ({
  getImprovementPrd: getImprovementPrdMock,
}));

function makeReq(headers: Record<string, string> = {}): NextRequest {
  const h = new Map(Object.entries(headers));
  return {
    headers: { get: (k: string) => h.get(k.toLowerCase()) ?? h.get(k) ?? null },
    url: 'http://localhost/api/audit-runs/run-1/improvement-prd',
  } as unknown as NextRequest;
}

describe('GET /api/audit-runs/:id/improvement-prd', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resolveCallerMock.mockResolvedValue({ uid: 'user-1', isAnonymous: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 UNAUTHORIZED when resolveCaller returns null', async () => {
    resolveCallerMock.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/audit-runs/[id]/improvement-prd/route');
    const res = await GET(makeReq(), { params: { id: 'run-1' } });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(getImprovementPrdMock).not.toHaveBeenCalled();
  });

  it('returns 400 INVALID_INPUT when path param id is empty', async () => {
    const { GET } = await import('@/app/api/audit-runs/[id]/improvement-prd/route');
    const res = await GET(makeReq({ authorization: 'Bearer fake' }), { params: { id: '' } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_INPUT');
    expect(getImprovementPrdMock).not.toHaveBeenCalled();
  });

  it('returns 404 NOT_FOUND when getImprovementPrd returns null', async () => {
    getImprovementPrdMock.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/audit-runs/[id]/improvement-prd/route');
    const res = await GET(makeReq({ authorization: 'Bearer fake' }), {
      params: { id: 'run-1' },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(getImprovementPrdMock).toHaveBeenCalledWith('run-1', 'user-1');
  });

  it('returns 200 with the improvement PRD payload on the happy path', async () => {
    const prd = {
      runId: 'run-1',
      title: 'Improvement PRD',
      body: 'Refactor X, document Y',
    };
    getImprovementPrdMock.mockResolvedValueOnce(prd);
    const { GET } = await import('@/app/api/audit-runs/[id]/improvement-prd/route');
    const res = await GET(makeReq({ authorization: 'Bearer fake' }), {
      params: { id: 'run-1' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(prd);
    expect(getImprovementPrdMock).toHaveBeenCalledWith('run-1', 'user-1');
  });

  it('returns 500 INTERNAL when getImprovementPrd throws', async () => {
    getImprovementPrdMock.mockRejectedValueOnce(new Error('firestore down'));
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { GET } = await import('@/app/api/audit-runs/[id]/improvement-prd/route');
    const res = await GET(makeReq({ authorization: 'Bearer fake' }), {
      params: { id: 'run-1' },
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL');
    stderrSpy.mockRestore();
  });
});
