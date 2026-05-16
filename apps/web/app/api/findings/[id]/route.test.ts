// Integration tests for GET /api/findings/:id?runId=...
//
// The finding id alone doesn't carry its parent run id, so the route requires
// `?runId=...` in the query string and surfaces a 400 if it's missing.
//
// Branches covered:
//   1. Auth fail (resolveCaller null)                       → 401
//   2. Missing findingId param                              → 400
//   3. Missing runId query                                  → 400
//   4. getFinding returns null (not-found/ownership)        → 404
//   5. Normal success                                       → 200 with {finding, evidences}
//   6. Service throws                                       → 500

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const { resolveCallerMock } = vi.hoisted(() => ({ resolveCallerMock: vi.fn() }));
const { getFindingMock } = vi.hoisted(() => ({ getFindingMock: vi.fn() }));

vi.mock('@/lib/audit-runs/auth', () => ({
  resolveCaller: resolveCallerMock,
}));

vi.mock('@/lib/audit-runs/get-findings', () => ({
  getFinding: getFindingMock,
}));

function makeReq(url: string, headers: Record<string, string> = {}): NextRequest {
  const h = new Map(Object.entries(headers));
  return {
    headers: { get: (k: string) => h.get(k.toLowerCase()) ?? h.get(k) ?? null },
    url,
  } as unknown as NextRequest;
}

describe('GET /api/findings/:id', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resolveCallerMock.mockResolvedValue({ uid: 'user-1', isAnonymous: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 UNAUTHORIZED when resolveCaller returns null', async () => {
    resolveCallerMock.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/findings/[id]/route');
    const req = makeReq('http://localhost/api/findings/f-1?runId=run-1');
    const res = await GET(req, { params: { id: 'f-1' } });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(getFindingMock).not.toHaveBeenCalled();
  });

  it('returns 400 INVALID_INPUT when findingId path param is empty', async () => {
    const { GET } = await import('@/app/api/findings/[id]/route');
    const req = makeReq('http://localhost/api/findings/?runId=run-1', {
      authorization: 'Bearer fake',
    });
    const res = await GET(req, { params: { id: '' } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_INPUT');
    expect(getFindingMock).not.toHaveBeenCalled();
  });

  it('returns 400 INVALID_INPUT when runId query string is missing', async () => {
    const { GET } = await import('@/app/api/findings/[id]/route');
    const req = makeReq('http://localhost/api/findings/f-1', {
      authorization: 'Bearer fake',
    });
    const res = await GET(req, { params: { id: 'f-1' } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_INPUT');
    expect(body.error.message).toMatch(/runId/);
    expect(getFindingMock).not.toHaveBeenCalled();
  });

  it('returns 404 NOT_FOUND when getFinding returns null', async () => {
    getFindingMock.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/findings/[id]/route');
    const req = makeReq('http://localhost/api/findings/f-1?runId=run-1', {
      authorization: 'Bearer fake',
    });
    const res = await GET(req, { params: { id: 'f-1' } });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(getFindingMock).toHaveBeenCalledWith('run-1', 'f-1', 'user-1');
  });

  it('returns 200 with {finding, evidences} on the happy path', async () => {
    const finding = { id: 'f-1', title: 'Bad thing', severity: 'HIGH' };
    const evidences = [
      { id: 'e-1', findingId: 'f-1' },
      { id: 'e-2', findingId: 'f-1' },
    ];
    getFindingMock.mockResolvedValueOnce({ finding, evidences });
    const { GET } = await import('@/app/api/findings/[id]/route');
    const req = makeReq('http://localhost/api/findings/f-1?runId=run-1', {
      authorization: 'Bearer fake',
    });
    const res = await GET(req, { params: { id: 'f-1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ finding, evidences });
    expect(getFindingMock).toHaveBeenCalledWith('run-1', 'f-1', 'user-1');
  });

  it('returns 500 INTERNAL when getFinding throws', async () => {
    getFindingMock.mockRejectedValueOnce(new Error('firestore down'));
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { GET } = await import('@/app/api/findings/[id]/route');
    const req = makeReq('http://localhost/api/findings/f-1?runId=run-1', {
      authorization: 'Bearer fake',
    });
    const res = await GET(req, { params: { id: 'f-1' } });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL');
    stderrSpy.mockRestore();
  });
});
