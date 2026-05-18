// Integration tests for GET /api/audit-runs/:id/report.
//
// Branches covered:
//   1. Auth fail (resolveCaller null)             → 401
//   2. Missing path param                         → 400
//   3. getReport returns null (not-found/ownership) → 404
//   4. Normal success                             → 200 with the report payload
//   5. Service throws                             → 500

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const { resolveCallerMock } = vi.hoisted(() => ({ resolveCallerMock: vi.fn() }));
const { getReportMock } = vi.hoisted(() => ({ getReportMock: vi.fn() }));

vi.mock('@/lib/audit-runs/auth', () => ({
  resolveCaller: resolveCallerMock,
}));

vi.mock('@/lib/audit-runs/get-report', () => ({
  getReport: getReportMock,
}));

function makeReq(headers: Record<string, string> = {}): NextRequest {
  const h = new Map(Object.entries(headers));
  return {
    headers: { get: (k: string) => h.get(k.toLowerCase()) ?? h.get(k) ?? null },
    url: 'http://localhost/api/audit-runs/run-1/report',
  } as unknown as NextRequest;
}

describe('GET /api/audit-runs/:id/report', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resolveCallerMock.mockResolvedValue({ uid: 'user-1', isAnonymous: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 UNAUTHORIZED when resolveCaller returns null', async () => {
    resolveCallerMock.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/audit-runs/[id]/report/route');
    const res = await GET(makeReq(), { params: Promise.resolve({ id: 'run-1' }) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(getReportMock).not.toHaveBeenCalled();
  });

  it('returns 400 INVALID_INPUT when path param id is empty', async () => {
    const { GET } = await import('@/app/api/audit-runs/[id]/report/route');
    const res = await GET(makeReq({ authorization: 'Bearer fake' }), { params: Promise.resolve({ id: '' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_INPUT');
    expect(getReportMock).not.toHaveBeenCalled();
  });

  it('returns 404 NOT_FOUND when getReport returns null', async () => {
    getReportMock.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/audit-runs/[id]/report/route');
    const res = await GET(makeReq({ authorization: 'Bearer fake' }), {
      params: Promise.resolve({ id: 'run-1' }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(getReportMock).toHaveBeenCalledWith('run-1', 'user-1');
  });

  it('returns 200 with the report payload on the happy path', async () => {
    const report = {
      runId: 'run-1',
      summary: 'All systems nominal',
      sections: [{ title: 'Security', body: 'OK' }],
    };
    getReportMock.mockResolvedValueOnce(report);
    const { GET } = await import('@/app/api/audit-runs/[id]/report/route');
    const res = await GET(makeReq({ authorization: 'Bearer fake' }), {
      params: Promise.resolve({ id: 'run-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(report);
    expect(getReportMock).toHaveBeenCalledWith('run-1', 'user-1');
  });

  it('returns 500 INTERNAL when getReport throws', async () => {
    getReportMock.mockRejectedValueOnce(new Error('firestore down'));
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { GET } = await import('@/app/api/audit-runs/[id]/report/route');
    const res = await GET(makeReq({ authorization: 'Bearer fake' }), {
      params: Promise.resolve({ id: 'run-1' }),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL');
    stderrSpy.mockRestore();
  });
});
