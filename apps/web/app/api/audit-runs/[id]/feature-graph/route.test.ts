// Integration tests for GET /api/audit-runs/:id/feature-graph.
//
// Branches covered:
//   1. Auth fail (resolveCaller null)                  → 401
//   2. Missing path param                              → 400
//   3. getFeatureGraph returns null (not-found/own)    → 404
//   4. Normal success                                  → 200 with the graph payload
//   5. Service throws                                  → 500

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const { resolveCallerMock } = vi.hoisted(() => ({ resolveCallerMock: vi.fn() }));
const { getFeatureGraphMock } = vi.hoisted(() => ({ getFeatureGraphMock: vi.fn() }));

vi.mock('@/lib/audit-runs/auth', () => ({
  resolveCaller: resolveCallerMock,
}));

vi.mock('@/lib/audit-runs/get-feature-graph', () => ({
  getFeatureGraph: getFeatureGraphMock,
}));

function makeReq(headers: Record<string, string> = {}): NextRequest {
  const h = new Map(Object.entries(headers));
  return {
    headers: { get: (k: string) => h.get(k.toLowerCase()) ?? h.get(k) ?? null },
    url: 'http://localhost/api/audit-runs/run-1/feature-graph',
  } as unknown as NextRequest;
}

describe('GET /api/audit-runs/:id/feature-graph', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resolveCallerMock.mockResolvedValue({ uid: 'user-1', isAnonymous: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 UNAUTHORIZED when resolveCaller returns null', async () => {
    resolveCallerMock.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/audit-runs/[id]/feature-graph/route');
    const res = await GET(makeReq(), { params: Promise.resolve({ id: 'run-1' }) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(getFeatureGraphMock).not.toHaveBeenCalled();
  });

  it('returns 400 INVALID_INPUT when path param id is empty', async () => {
    const { GET } = await import('@/app/api/audit-runs/[id]/feature-graph/route');
    const res = await GET(makeReq({ authorization: 'Bearer fake' }), { params: Promise.resolve({ id: '' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_INPUT');
    expect(getFeatureGraphMock).not.toHaveBeenCalled();
  });

  it('returns 404 NOT_FOUND when getFeatureGraph returns null', async () => {
    getFeatureGraphMock.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/audit-runs/[id]/feature-graph/route');
    const res = await GET(makeReq({ authorization: 'Bearer fake' }), {
      params: Promise.resolve({ id: 'run-1' }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(getFeatureGraphMock).toHaveBeenCalledWith('run-1', 'user-1');
  });

  it('returns 200 with the feature graph payload on the happy path', async () => {
    const graph = {
      runId: 'run-1',
      nodes: [{ id: 'feat-1', label: 'Login' }],
      edges: [{ source: 'feat-1', target: 'feat-2' }],
    };
    getFeatureGraphMock.mockResolvedValueOnce(graph);
    const { GET } = await import('@/app/api/audit-runs/[id]/feature-graph/route');
    const res = await GET(makeReq({ authorization: 'Bearer fake' }), {
      params: Promise.resolve({ id: 'run-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(graph);
    expect(getFeatureGraphMock).toHaveBeenCalledWith('run-1', 'user-1');
  });

  it('returns 500 INTERNAL when getFeatureGraph throws', async () => {
    getFeatureGraphMock.mockRejectedValueOnce(new Error('firestore down'));
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { GET } = await import('@/app/api/audit-runs/[id]/feature-graph/route');
    const res = await GET(makeReq({ authorization: 'Bearer fake' }), {
      params: Promise.resolve({ id: 'run-1' }),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL');
    stderrSpy.mockRestore();
  });
});
