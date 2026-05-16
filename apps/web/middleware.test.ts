// Tests for the Next.js security-headers middleware.
//
// The middleware is pure logic (no React) and runs cleanly under
// `environment: 'node'`. Coverage targets the contract documented in the
// middleware file itself:
//   - CSP, X-Frame-Options=DENY, Permissions-Policy applied on every pass
//   - HSTS only when NODE_ENV === 'production'
//   - CSRF guard returns 403 for cross-origin mutating /api/* requests
//   - Same-origin and non-mutating /api/* requests pass through
//
// NOTE: NODE_ENV is read at module-load time (`const isProd = ...` at the
// top of middleware.ts), so production-mode assertions use vi.resetModules()
// + an isolated import after stubbing process.env. Default-mode assertions
// rely on the test runner's default NODE_ENV = 'test' (non-prod).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

type HeaderMap = Record<string, string>;

function makeReq(opts: {
  method?: string;
  pathname?: string;
  headers?: HeaderMap;
  url?: string;
}): NextRequest {
  const method = opts.method ?? 'GET';
  const pathname = opts.pathname ?? '/';
  const url = opts.url ?? `http://example.com${pathname}`;
  const headers = new Map(
    Object.entries(opts.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    method,
    nextUrl: { pathname },
    url,
    headers: {
      get: (k: string) => headers.get(k.toLowerCase()) ?? null,
    },
  } as unknown as NextRequest;
}

describe('middleware (default / non-prod env)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('adds CSP, X-Frame-Options=DENY, and Permissions-Policy on a normal GET', async () => {
    const { middleware } = await import('./middleware');
    const res = middleware(makeReq({ pathname: '/audits/abc' }));

    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('permissions-policy')).toContain('camera=()');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  });

  it('does NOT set HSTS when NODE_ENV !== production', async () => {
    const { middleware } = await import('./middleware');
    const res = middleware(makeReq({ pathname: '/' }));
    expect(res.headers.get('strict-transport-security')).toBeNull();
  });

  it('passes through GET /api/* without CSRF rejection', async () => {
    const { middleware } = await import('./middleware');
    const res = middleware(makeReq({ method: 'GET', pathname: '/api/audit-runs' }));
    expect(res.status).not.toBe(403);
    expect(res.headers.get('content-security-policy')).toBeTruthy();
  });

  it('rejects cross-origin POST /api/* with 403 (Origin host !== Host)', async () => {
    const { middleware } = await import('./middleware');
    const res = middleware(
      makeReq({
        method: 'POST',
        pathname: '/api/audit-runs',
        headers: {
          origin: 'https://evil.example.com',
          host: 'good.example.com',
        },
      }),
    );
    expect(res.status).toBe(403);
  });

  it('allows same-origin POST /api/* (Origin host === Host)', async () => {
    const { middleware } = await import('./middleware');
    const res = middleware(
      makeReq({
        method: 'POST',
        pathname: '/api/audit-runs',
        headers: {
          origin: 'https://good.example.com',
          host: 'good.example.com',
        },
      }),
    );
    expect(res.status).not.toBe(403);
  });

  it('rejects POST /api/* with no Origin and no matching Referer', async () => {
    const { middleware } = await import('./middleware');
    const res = middleware(
      makeReq({
        method: 'POST',
        pathname: '/api/audit-runs',
        headers: { host: 'good.example.com' },
      }),
    );
    expect(res.status).toBe(403);
  });

  it('allows POST /api/* when Referer host matches Host (Origin missing)', async () => {
    const { middleware } = await import('./middleware');
    const res = middleware(
      makeReq({
        method: 'POST',
        pathname: '/api/audit-runs',
        headers: {
          referer: 'https://good.example.com/page',
          host: 'good.example.com',
        },
      }),
    );
    expect(res.status).not.toBe(403);
  });

  it('does not CSRF-guard non-/api paths even for POST', async () => {
    const { middleware } = await import('./middleware');
    const res = middleware(
      makeReq({
        method: 'POST',
        pathname: '/audits/abc',
        headers: { origin: 'https://evil.example.com', host: 'good.example.com' },
      }),
    );
    expect(res.status).not.toBe(403);
  });
});

describe('middleware (production env)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    // vi.unstubAllEnvs() restores NODE_ENV to its pre-stub value; manual
    // process.env assignment is unsafe under TS 5.4+ (NODE_ENV is readonly).
    vi.unstubAllEnvs();
  });

  it('sets Strict-Transport-Security in production', async () => {
    const { middleware } = await import('./middleware');
    const res = middleware(makeReq({ pathname: '/' }));
    expect(res.headers.get('strict-transport-security')).toMatch(/max-age=31536000/);
    expect(res.headers.get('strict-transport-security')).toContain('includeSubDomains');
  });

  it('omits unsafe-eval from script-src CSP in production', async () => {
    const { middleware } = await import('./middleware');
    const res = middleware(makeReq({ pathname: '/' }));
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain('upgrade-insecure-requests');
  });
});

describe('middleware (exported config)', () => {
  it('exports a matcher excluding _next static/image and favicon', async () => {
    const mod = await import('./middleware');
    expect(mod.config).toBeDefined();
    expect(Array.isArray(mod.config.matcher)).toBe(true);
    const matcher = mod.config.matcher.join('|');
    expect(matcher).toContain('_next/static');
    expect(matcher).toContain('favicon');
  });
});
