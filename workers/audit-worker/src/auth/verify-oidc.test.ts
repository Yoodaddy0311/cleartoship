// Tests for `verify-oidc.ts` — the OIDC verification middleware and the
// env-driven factory `oidcMiddlewareFromEnv()`.
//
// Strategy:
//   - Mock `google-auth-library` so we control `verifyIdToken` directly.
//     Because `verify-oidc.ts` constructs ONE shared OAuth2Client at module
//     load, we mock the constructor to return a stub whose `verifyIdToken`
//     spy is exposed via a module-level handle.
//   - Build a minimal Express-shaped request/response/next triple per test.
//   - Stub env vars in beforeEach + unstub in afterEach. We re-import the
//     module in each test (vi.resetModules + dynamic import) because the
//     production path constructs the verifier closure at import time AND
//     reads env at oidcMiddlewareFromEnv() call time.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyIdTokenMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
}));

vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdTokenMock;
  },
}));

interface FakeReq {
  headers: Record<string, string | string[] | undefined>;
}

interface FakeRes {
  statusCode: number;
  body: unknown;
  status: (code: number) => FakeRes;
  json: (body: unknown) => FakeRes;
}

function makeReq(headers: Record<string, string> = {}): FakeReq {
  return { headers };
}

function makeRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return res;
}

const ENV_KEYS = [
  'NODE_ENV',
  'ALLOW_DEV_BYPASS',
  'AUDIT_WORKER_URL',
  'AUDIT_WORKER_INVOKER_SA',
] as const;

describe('verify-oidc', () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) original[k] = process.env[k];
    verifyIdTokenMock.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
    vi.restoreAllMocks();
  });

  async function loadModule() {
    return await import('./verify-oidc.js');
  }

  describe('makeOidcVerifier', () => {
    it('happy path: valid Bearer token with matching audience+email → next()', async () => {
      const { makeOidcVerifier } = await loadModule();
      verifyIdTokenMock.mockResolvedValueOnce({
        getPayload: () => ({
          email: 'invoker@demo.iam.gserviceaccount.com',
          email_verified: true,
        }),
      });
      const verifier = makeOidcVerifier({
        audience: 'https://worker.example.com',
        invokerEmail: 'invoker@demo.iam.gserviceaccount.com',
      });
      const req = makeReq({ authorization: 'Bearer abc.def.ghi' });
      const res = makeRes();
      const next = vi.fn();

      await verifier(req as never, res as never, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBe(200);
      expect(verifyIdTokenMock).toHaveBeenCalledWith({
        idToken: 'abc.def.ghi',
        audience: 'https://worker.example.com',
      });
    });

    it('missing Authorization header → 401 UNAUTHENTICATED', async () => {
      const { makeOidcVerifier } = await loadModule();
      const verifier = makeOidcVerifier({
        audience: 'https://w',
        invokerEmail: 'e@x',
      });
      const res = makeRes();
      const next = vi.fn();

      await verifier(makeReq() as never, res as never, next);

      expect(res.statusCode).toBe(401);
      expect((res.body as { error: { code: string } }).error.code).toBe('UNAUTHENTICATED');
      expect(next).not.toHaveBeenCalled();
    });

    it('non-Bearer Authorization header → 401', async () => {
      const { makeOidcVerifier } = await loadModule();
      const verifier = makeOidcVerifier({ audience: 'https://w', invokerEmail: 'e@x' });
      const res = makeRes();
      const next = vi.fn();

      await verifier(makeReq({ authorization: 'Basic abc' }) as never, res as never, next);

      expect(res.statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('verifyIdToken throws (invalid token) → 401 with OIDC verification failed message', async () => {
      const { makeOidcVerifier } = await loadModule();
      verifyIdTokenMock.mockRejectedValueOnce(new Error('Token used too late'));
      const verifier = makeOidcVerifier({ audience: 'https://w', invokerEmail: 'e@x' });
      const res = makeRes();
      const next = vi.fn();

      await verifier(makeReq({ authorization: 'Bearer bad' }) as never, res as never, next);

      expect(res.statusCode).toBe(401);
      expect((res.body as { error: { message: string } }).error.message).toContain(
        'OIDC verification failed',
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('payload missing → 401', async () => {
      const { makeOidcVerifier } = await loadModule();
      verifyIdTokenMock.mockResolvedValueOnce({ getPayload: () => null });
      const verifier = makeOidcVerifier({ audience: 'https://w', invokerEmail: 'e@x' });
      const res = makeRes();
      const next = vi.fn();

      await verifier(makeReq({ authorization: 'Bearer abc' }) as never, res as never, next);

      expect(res.statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('payload email mismatch → 401 (Token issuer not configured invoker)', async () => {
      const { makeOidcVerifier } = await loadModule();
      verifyIdTokenMock.mockResolvedValueOnce({
        getPayload: () => ({ email: 'other@x.com', email_verified: true }),
      });
      const verifier = makeOidcVerifier({
        audience: 'https://w',
        invokerEmail: 'expected@x.com',
      });
      const res = makeRes();
      const next = vi.fn();

      await verifier(makeReq({ authorization: 'Bearer abc' }) as never, res as never, next);

      expect(res.statusCode).toBe(401);
      expect((res.body as { error: { message: string } }).error.message).toContain(
        'Token issuer is not the configured invoker',
      );
    });

    it('email_verified is false → 401', async () => {
      const { makeOidcVerifier } = await loadModule();
      verifyIdTokenMock.mockResolvedValueOnce({
        getPayload: () => ({ email: 'invoker@x', email_verified: false }),
      });
      const verifier = makeOidcVerifier({ audience: 'https://w', invokerEmail: 'invoker@x' });
      const res = makeRes();
      const next = vi.fn();

      await verifier(makeReq({ authorization: 'Bearer abc' }) as never, res as never, next);

      expect(res.statusCode).toBe(401);
      expect((res.body as { error: { message: string } }).error.message).toContain(
        'Invoker email not verified',
      );
    });
  });

  describe('oidcMiddlewareFromEnv — production', () => {
    it('production: ALLOW_DEV_BYPASS=1 is IGNORED — real OIDC enforced', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_DEV_BYPASS = '1';
      process.env.AUDIT_WORKER_URL = 'https://w';
      process.env.AUDIT_WORKER_INVOKER_SA = 'invoker@x';
      verifyIdTokenMock.mockResolvedValueOnce({
        getPayload: () => ({ email: 'invoker@x', email_verified: true }),
      });

      const { oidcMiddlewareFromEnv } = await loadModule();
      const mw = oidcMiddlewareFromEnv();
      const res = makeRes();
      const next = vi.fn();

      // Even though X-Dev-Mode is set, production must verify.
      await (mw as (r: FakeReq, s: FakeRes, n: () => void) => Promise<void> | void)(
        makeReq({ authorization: 'Bearer good', 'x-dev-mode': '1' }),
        res,
        next,
      );

      expect(verifyIdTokenMock).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('production without AUDIT_WORKER_URL → fails closed with 503 WORKER_MISCONFIGURED', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.AUDIT_WORKER_URL;
      delete process.env.AUDIT_WORKER_INVOKER_SA;

      const { oidcMiddlewareFromEnv } = await loadModule();
      const mw = oidcMiddlewareFromEnv();
      const res = makeRes();
      const next = vi.fn();

      mw(makeReq() as never, res as never, next);

      expect(res.statusCode).toBe(503);
      expect((res.body as { error: { code: string } }).error.code).toBe('WORKER_MISCONFIGURED');
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('oidcMiddlewareFromEnv — development', () => {
    it('dev WITHOUT ALLOW_DEV_BYPASS: permissive passthrough (next() always)', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.ALLOW_DEV_BYPASS;
      process.env.AUDIT_WORKER_URL = 'https://w';
      process.env.AUDIT_WORKER_INVOKER_SA = 'invoker@x';

      const { oidcMiddlewareFromEnv } = await loadModule();
      const mw = oidcMiddlewareFromEnv();
      const res = makeRes();
      const next = vi.fn();

      mw(makeReq() as never, res as never, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(verifyIdTokenMock).not.toHaveBeenCalled();
    });

    it('dev with ALLOW_DEV_BYPASS=1 + X-Dev-Mode header → bypass succeeds (next())', async () => {
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_DEV_BYPASS = '1';
      process.env.AUDIT_WORKER_URL = 'https://w';
      process.env.AUDIT_WORKER_INVOKER_SA = 'invoker@x';
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

      const { oidcMiddlewareFromEnv } = await loadModule();
      const mw = oidcMiddlewareFromEnv();
      const res = makeRes();
      const next = vi.fn();

      mw(makeReq({ 'x-dev-mode': '1' }) as never, res as never, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(verifyIdTokenMock).not.toHaveBeenCalled();
      // Loud warning should have been logged at startup.
      const logged = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(logged).toContain('DEV BYPASS ENABLED');
      stderrSpy.mockRestore();
    });

    it('dev with ALLOW_DEV_BYPASS=1 but missing X-Dev-Mode → falls through to real OIDC verifier', async () => {
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_DEV_BYPASS = '1';
      process.env.AUDIT_WORKER_URL = 'https://w';
      process.env.AUDIT_WORKER_INVOKER_SA = 'invoker@x';
      verifyIdTokenMock.mockResolvedValueOnce({
        getPayload: () => ({ email: 'invoker@x', email_verified: true }),
      });

      const { oidcMiddlewareFromEnv } = await loadModule();
      const mw = oidcMiddlewareFromEnv();
      const res = makeRes();
      // The middleware fires the async verifier as `void fallbackVerifier(...)`
      // (fire-and-forget) so we cannot simply await `mw()`. Track via flag.
      let nextCalled = false;
      const next = vi.fn(() => {
        nextCalled = true;
      });

      // No X-Dev-Mode header → bypass does NOT apply → fallthrough verifier
      // requires bearer token. Provide one so the happy path completes.
      mw(makeReq({ authorization: 'Bearer abc' }) as never, res as never, next);

      // Flush microtasks for the async verifier to settle.
      for (let i = 0; i < 10 && !nextCalled; i++) {
        await Promise.resolve();
      }

      // Verifier should have been invoked (real OIDC path).
      expect(verifyIdTokenMock).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('dev with ALLOW_DEV_BYPASS=1, no X-Dev-Mode, no creds → permissive (legacy local behaviour)', async () => {
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_DEV_BYPASS = '1';
      delete process.env.AUDIT_WORKER_URL;
      delete process.env.AUDIT_WORKER_INVOKER_SA;

      const { oidcMiddlewareFromEnv } = await loadModule();
      const mw = oidcMiddlewareFromEnv();
      const res = makeRes();
      const next = vi.fn();

      mw(makeReq() as never, res as never, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(verifyIdTokenMock).not.toHaveBeenCalled();
    });

    it('dev with ALLOW_DEV_BYPASS=1, X-Dev-Mode header but value !== "1" → falls through (header value strict)', async () => {
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_DEV_BYPASS = '1';
      process.env.AUDIT_WORKER_URL = 'https://w';
      process.env.AUDIT_WORKER_INVOKER_SA = 'invoker@x';
      verifyIdTokenMock.mockResolvedValueOnce({
        getPayload: () => ({ email: 'invoker@x', email_verified: true }),
      });

      const { oidcMiddlewareFromEnv } = await loadModule();
      const mw = oidcMiddlewareFromEnv();
      const res = makeRes();
      let nextCalled = false;
      const next = vi.fn(() => {
        nextCalled = true;
      });

      mw(
        makeReq({ authorization: 'Bearer abc', 'x-dev-mode': 'yes' }) as never,
        res as never,
        next,
      );

      // Flush microtasks for the fire-and-forget verifier.
      for (let i = 0; i < 10 && !nextCalled; i++) {
        await Promise.resolve();
      }

      // Header was not "1" → real verifier runs.
      expect(verifyIdTokenMock).toHaveBeenCalledTimes(1);
    });
  });
});
