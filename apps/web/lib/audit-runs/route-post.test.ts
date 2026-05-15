// Integration test for POST /api/audit-runs deploy-URL SSRF guard (Item #13).
// The route is imported via path alias; auth, Firestore, Cloud Tasks and DNS
// are mocked. Test file lives under lib/ so vitest's `lib/**/*.test.ts`
// include pattern picks it up.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

// --- Hoisted mocks -----------------------------------------------------------
const { resolveCallerMock } = vi.hoisted(() => ({ resolveCallerMock: vi.fn() }));
const { createAuditRunMock } = vi.hoisted(() => ({ createAuditRunMock: vi.fn() }));
const { touchUserDocMock } = vi.hoisted(() => ({ touchUserDocMock: vi.fn() }));
const { dnsLookupMock } = vi.hoisted(() => ({ dnsLookupMock: vi.fn() }));

vi.mock('@/lib/audit-runs/auth', () => ({
  resolveCaller: resolveCallerMock,
}));

vi.mock('@/lib/audit-runs/create-audit-run', () => ({
  createAuditRun: createAuditRunMock,
}));

vi.mock('@/lib/audit-runs/touch-user-doc', () => ({
  touchUserDoc: touchUserDocMock,
}));

// Mock node:dns to control validateDeployUrl's DNS resolution path
vi.mock('node:dns', () => ({
  promises: { lookup: dnsLookupMock },
}));

// --- Helpers -----------------------------------------------------------------
function makeReq(body: unknown, headers: Record<string, string> = {}): NextRequest {
  const h = new Map(Object.entries(headers));
  return {
    headers: { get: (k: string) => h.get(k.toLowerCase()) ?? h.get(k) ?? null },
    json: async () => body,
  } as unknown as NextRequest;
}

// --- Tests -------------------------------------------------------------------
describe('POST /api/audit-runs — SSRF guard (Item #13)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resolveCallerMock.mockResolvedValue({ uid: 'user-1', isAnonymous: false });
    createAuditRunMock.mockResolvedValue({
      auditRunId: 'run-1',
      projectId: 'proj-1',
      status: 'PENDING',
    });
    touchUserDocMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects localhost deployUrl with 400 before reaching createAuditRun', async () => {
    const { POST } = await import('@/app/api/audit-runs/route');
    const req = makeReq(
      {
        repoUrl: 'https://github.com/owner/repo',
        deployUrl: 'http://localhost/',
      },
      { authorization: 'Bearer fake' },
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_INPUT');
    expect(body.error.message).toMatch(/사설|메타데이터|host/i);
    expect(createAuditRunMock).not.toHaveBeenCalled();
    // localhost is a literal reserved host — DNS lookup must NOT be reached.
    expect(dnsLookupMock).not.toHaveBeenCalled();
  });

  it('rejects deployUrl whose DNS resolves to a private IP (rebinding) with 400', async () => {
    // Public-looking hostname but its DNS A record is 10.0.0.1
    dnsLookupMock.mockResolvedValue([{ address: '10.0.0.1', family: 4 }]);
    const { POST } = await import('@/app/api/audit-runs/route');
    const req = makeReq(
      {
        repoUrl: 'https://github.com/owner/repo',
        deployUrl: 'https://attacker-rebind.example.com/',
      },
      { authorization: 'Bearer fake' },
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_INPUT');
    expect(body.error.message).toMatch(/10\.0\.0\.1|사설|내부/);
    expect(dnsLookupMock).toHaveBeenCalledOnce();
    expect(createAuditRunMock).not.toHaveBeenCalled();
  });

  it('accepts deployUrl that resolves to a public IP and calls createAuditRun', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const { POST } = await import('@/app/api/audit-runs/route');
    const req = makeReq(
      {
        repoUrl: 'https://github.com/owner/repo',
        deployUrl: 'https://example.com/',
      },
      { authorization: 'Bearer fake' },
    );
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(dnsLookupMock).toHaveBeenCalledOnce();
    expect(createAuditRunMock).toHaveBeenCalledOnce();
    expect(createAuditRunMock).toHaveBeenCalledWith(
      expect.objectContaining({ deployUrl: 'https://example.com/' }),
      { ownerId: 'user-1' },
    );
  });

  it('skips deploy-URL validation when deployUrl is omitted (existing behavior)', async () => {
    const { POST } = await import('@/app/api/audit-runs/route');
    const req = makeReq(
      { repoUrl: 'https://github.com/owner/repo' },
      { authorization: 'Bearer fake' },
    );
    const res = await POST(req);
    expect(res.status).toBe(201);
    // No deployUrl → no DNS lookup at all
    expect(dnsLookupMock).not.toHaveBeenCalled();
    expect(createAuditRunMock).toHaveBeenCalledOnce();
  });

  // --- Item #15: anonymous-user denormalization ------------------------------
  it('fires touchUserDoc with caller uid + isAnonymous after successful create', async () => {
    resolveCallerMock.mockResolvedValue({ uid: 'anon-uid-9', isAnonymous: true });
    const { POST } = await import('@/app/api/audit-runs/route');
    const req = makeReq(
      { repoUrl: 'https://github.com/owner/repo' },
      { authorization: 'Bearer fake' },
    );
    const res = await POST(req);
    expect(res.status).toBe(201);
    // touchUserDoc is fire-and-forget — await one microtask tick.
    await new Promise((r) => setTimeout(r, 0));
    expect(touchUserDocMock).toHaveBeenCalledWith({
      uid: 'anon-uid-9',
      isAnonymous: true,
    });
  });

  it('does not block 201 when touchUserDoc rejects', async () => {
    touchUserDocMock.mockRejectedValueOnce(new Error('firestore offline'));
    const { POST } = await import('@/app/api/audit-runs/route');
    const req = makeReq(
      { repoUrl: 'https://github.com/owner/repo' },
      { authorization: 'Bearer fake' },
    );
    const res = await POST(req);
    expect(res.status).toBe(201);
  });
});
