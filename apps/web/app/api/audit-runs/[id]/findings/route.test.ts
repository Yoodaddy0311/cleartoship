// Integration tests for GET /api/audit-runs/:id/findings.
//
// Branches covered:
//   1. Auth fail (resolveCaller null)                  → 401
//   2. Missing path param                              → 400
//   3. Query Zod schema rejects (invalid severity)     → 400
//   4. listFindings returns null (not-found/ownership) → 404
//   5. Normal success                                  → 200 with {findings,nextCursor}
//   6. Service throws                                  → 500

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const { resolveCallerMock } = vi.hoisted(() => ({ resolveCallerMock: vi.fn() }));
const { listFindingsMock } = vi.hoisted(() => ({ listFindingsMock: vi.fn() }));

vi.mock('@/lib/audit-runs/auth', () => ({
  resolveCaller: resolveCallerMock,
}));

vi.mock('@/lib/audit-runs/get-findings', () => ({
  listFindings: listFindingsMock,
}));

function makeReq(url: string, headers: Record<string, string> = {}): NextRequest {
  const h = new Map(Object.entries(headers));
  return {
    headers: { get: (k: string) => h.get(k.toLowerCase()) ?? h.get(k) ?? null },
    url,
  } as unknown as NextRequest;
}

describe('GET /api/audit-runs/:id/findings', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resolveCallerMock.mockResolvedValue({ uid: 'user-1', isAnonymous: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 UNAUTHORIZED when resolveCaller returns null', async () => {
    resolveCallerMock.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/audit-runs/[id]/findings/route');
    const req = makeReq('http://localhost/api/audit-runs/run-1/findings');
    const res = await GET(req, { params: Promise.resolve({ id: 'run-1' }) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(listFindingsMock).not.toHaveBeenCalled();
  });

  it('returns 400 INVALID_INPUT when path param id is empty', async () => {
    const { GET } = await import('@/app/api/audit-runs/[id]/findings/route');
    const req = makeReq('http://localhost/api/audit-runs//findings', {
      authorization: 'Bearer fake',
    });
    const res = await GET(req, { params: Promise.resolve({ id: '' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_INPUT');
    expect(listFindingsMock).not.toHaveBeenCalled();
  });

  it('returns 400 INVALID_INPUT when severity query param is invalid', async () => {
    const { GET } = await import('@/app/api/audit-runs/[id]/findings/route');
    const req = makeReq(
      'http://localhost/api/audit-runs/run-1/findings?severity=BANANA',
      { authorization: 'Bearer fake' },
    );
    const res = await GET(req, { params: Promise.resolve({ id: 'run-1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_INPUT');
    expect(body.error.details).toBeDefined();
    expect(listFindingsMock).not.toHaveBeenCalled();
  });

  it('returns 404 NOT_FOUND when listFindings returns null', async () => {
    listFindingsMock.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/audit-runs/[id]/findings/route');
    const req = makeReq('http://localhost/api/audit-runs/run-1/findings', {
      authorization: 'Bearer fake',
    });
    const res = await GET(req, { params: Promise.resolve({ id: 'run-1' }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(listFindingsMock).toHaveBeenCalledWith('run-1', 'user-1', expect.any(Object));
  });

  it('returns 200 with {findings, nextCursor} on the happy path', async () => {
    listFindingsMock.mockResolvedValueOnce({
      findings: [
        { id: 'f-1', title: 'a', severity: 'P0' },
        { id: 'f-2', title: 'b', severity: 'P2' },
      ],
      nextCursor: 'f-2',
    });
    const { GET } = await import('@/app/api/audit-runs/[id]/findings/route');
    const req = makeReq(
      'http://localhost/api/audit-runs/run-1/findings?severity=P0&limit=2',
      { authorization: 'Bearer fake' },
    );
    const res = await GET(req, { params: Promise.resolve({ id: 'run-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.findings).toHaveLength(2);
    expect(body.nextCursor).toBe('f-2');
    expect(listFindingsMock).toHaveBeenCalledWith(
      'run-1',
      'user-1',
      expect.objectContaining({ severity: 'P0', limit: 2 }),
    );
  });

  it('returns 500 INTERNAL when listFindings throws', async () => {
    listFindingsMock.mockRejectedValueOnce(new Error('firestore down'));
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { GET } = await import('@/app/api/audit-runs/[id]/findings/route');
    const req = makeReq('http://localhost/api/audit-runs/run-1/findings', {
      authorization: 'Bearer fake',
    });
    const res = await GET(req, { params: Promise.resolve({ id: 'run-1' }) });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL');
    stderrSpy.mockRestore();
  });
});
