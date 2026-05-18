// Integration tests for GET /api/audit-runs/:id/evidences.
//
// Branches:
//   1. Auth fail (resolveCaller null)              → 401
//   2. Missing path param                          → 400
//   3. listEvidencesForRun returns null (ownership)→ 404
//   4. Happy path                                  → 200 with {evidences, truncated}
//   5. Service throws                              → 500

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const { resolveCallerMock } = vi.hoisted(() => ({ resolveCallerMock: vi.fn() }));
const { listEvidencesForRunMock } = vi.hoisted(() => ({
  listEvidencesForRunMock: vi.fn(),
}));

vi.mock('@/lib/audit-runs/auth', () => ({
  resolveCaller: resolveCallerMock,
}));

vi.mock('@/lib/audit-runs/get-findings', () => ({
  listEvidencesForRun: listEvidencesForRunMock,
}));

function makeReq(url: string, headers: Record<string, string> = {}): NextRequest {
  const h = new Map(Object.entries(headers));
  return {
    headers: { get: (k: string) => h.get(k.toLowerCase()) ?? h.get(k) ?? null },
    url,
  } as unknown as NextRequest;
}

describe('GET /api/audit-runs/:id/evidences', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resolveCallerMock.mockResolvedValue({ uid: 'user-1', isAnonymous: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 UNAUTHORIZED when resolveCaller returns null', async () => {
    resolveCallerMock.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/audit-runs/[id]/evidences/route');
    const req = makeReq('http://localhost/api/audit-runs/run-1/evidences');
    const res = await GET(req, { params: Promise.resolve({ id: 'run-1' }) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(listEvidencesForRunMock).not.toHaveBeenCalled();
  });

  it('returns 400 INVALID_INPUT when path param id is empty', async () => {
    const { GET } = await import('@/app/api/audit-runs/[id]/evidences/route');
    const req = makeReq('http://localhost/api/audit-runs//evidences', {
      authorization: 'Bearer fake',
    });
    const res = await GET(req, { params: Promise.resolve({ id: '' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_INPUT');
    expect(listEvidencesForRunMock).not.toHaveBeenCalled();
  });

  it('returns 404 NOT_FOUND when listEvidencesForRun returns null', async () => {
    listEvidencesForRunMock.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/audit-runs/[id]/evidences/route');
    const req = makeReq('http://localhost/api/audit-runs/run-1/evidences', {
      authorization: 'Bearer fake',
    });
    const res = await GET(req, { params: Promise.resolve({ id: 'run-1' }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(listEvidencesForRunMock).toHaveBeenCalledWith('run-1', 'user-1');
  });

  it('returns 200 with {evidences, truncated} on the happy path', async () => {
    listEvidencesForRunMock.mockResolvedValueOnce({
      evidences: [
        { id: 'e-1', findingId: 'f-1' },
        { id: 'e-2', findingId: null },
      ],
      truncated: false,
    });
    const { GET } = await import('@/app/api/audit-runs/[id]/evidences/route');
    const req = makeReq('http://localhost/api/audit-runs/run-1/evidences', {
      authorization: 'Bearer fake',
    });
    const res = await GET(req, { params: Promise.resolve({ id: 'run-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.evidences).toHaveLength(2);
    expect(body.truncated).toBe(false);
  });

  it('returns 500 INTERNAL when listEvidencesForRun throws', async () => {
    listEvidencesForRunMock.mockRejectedValueOnce(new Error('firestore down'));
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const { GET } = await import('@/app/api/audit-runs/[id]/evidences/route');
    const req = makeReq('http://localhost/api/audit-runs/run-1/evidences', {
      authorization: 'Bearer fake',
    });
    const res = await GET(req, { params: Promise.resolve({ id: 'run-1' }) });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL');
    stderrSpy.mockRestore();
  });
});
