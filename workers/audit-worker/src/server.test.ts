// Tests for `server.ts` — the Express HTTP entrypoint for the audit-worker.
//
// Strategy:
//   - `server.ts` executes at import time: it creates an Express app, registers
//     middleware + routes, and calls `app.listen()`. We mock `express` so the
//     listener never opens a real port; the fake app records the registered
//     routes/middleware so each test can invoke handlers directly.
//   - We mock `./auth/verify-oidc.js` so `oidcMiddlewareFromEnv()` returns a
//     controllable spy (we assert it's wired before the `/run` handler).
//   - We mock `./pipeline/runner.js` so `runPipeline` doesn't touch Firestore
//     and we can verify it's invoked exactly when expected.
//   - We mock `@cleartoship/shared-types` to expose a tiny stub for
//     `AuditTaskPayloadSchema.safeParse` (success path + invalid path) so the
//     test stays decoupled from the real zod schema's required fields.
//   - Env vars (WORKER_PORT, NODE_ENV, ALLOW_DEV_BYPASS) are snapshotted in
//     beforeEach and restored in afterEach.
//   - `vi.resetModules()` runs before each test so the server module is
//     re-imported with fresh mock state and the listener callback fires anew.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — vi.mock factories execute before module top-level code.
// ---------------------------------------------------------------------------

const {
  oidcMiddlewareMock,
  oidcFactoryMock,
  runPipelineMock,
  safeParseMock,
} = vi.hoisted(() => {
  const oidcMw = vi.fn((_req: unknown, _res: unknown, next: () => void) => {
    next();
  });
  return {
    oidcMiddlewareMock: oidcMw,
    oidcFactoryMock: vi.fn(() => oidcMw),
    runPipelineMock: vi.fn(async () => undefined),
    safeParseMock: vi.fn(),
  };
});

vi.mock('./auth/verify-oidc.js', () => ({
  oidcMiddlewareFromEnv: oidcFactoryMock,
  makeOidcVerifier: vi.fn(),
}));

vi.mock('./pipeline/runner.js', () => ({
  runPipeline: runPipelineMock,
}));

vi.mock('@cleartoship/shared-types', () => ({
  AuditTaskPayloadSchema: {
    safeParse: safeParseMock,
  },
}));

// ---------------------------------------------------------------------------
// Express mock — captures routes/middleware and a never-opened listener.
// ---------------------------------------------------------------------------

interface FakeRoute {
  method: 'get' | 'post';
  path: string;
  handlers: Array<(...args: unknown[]) => unknown>;
}

interface FakeApp {
  routes: FakeRoute[];
  middleware: Array<(...args: unknown[]) => unknown>;
  listenSpy: ReturnType<typeof vi.fn>;
  lastListenPort: number | null;
  lastListenCallback: (() => void) | null;
}

let fakeApp: FakeApp;

const jsonMiddlewareSentinel = vi.fn();

vi.mock('express', () => {
  const factory = () => {
    const app = {
      use: vi.fn((mw: (...args: unknown[]) => unknown) => {
        fakeApp.middleware.push(mw);
        return app;
      }),
      get: vi.fn((path: string, ...handlers: Array<(...args: unknown[]) => unknown>) => {
        fakeApp.routes.push({ method: 'get', path, handlers });
        return app;
      }),
      post: vi.fn((path: string, ...handlers: Array<(...args: unknown[]) => unknown>) => {
        fakeApp.routes.push({ method: 'post', path, handlers });
        return app;
      }),
      listen: vi.fn((port: number, cb?: () => void) => {
        fakeApp.lastListenPort = port;
        fakeApp.lastListenCallback = cb ?? null;
        if (cb) cb();
        return { close: vi.fn() };
      }),
    };
    fakeApp.listenSpy = app.listen as unknown as ReturnType<typeof vi.fn>;
    return app;
  };
  // The real `express` is a function with attached helpers like `.json()`.
  const expressFn = Object.assign(factory, {
    json: vi.fn(() => jsonMiddlewareSentinel),
    urlencoded: vi.fn(() => jsonMiddlewareSentinel),
  });
  return { default: expressFn };
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface FakeRes {
  statusCode: number;
  body: unknown;
  status: (code: number) => FakeRes;
  json: (body: unknown) => FakeRes;
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

function makeReq(body: unknown = {}): { body: unknown; headers: Record<string, string> } {
  return { body, headers: {} };
}

function freshFakeApp(): FakeApp {
  return {
    routes: [],
    middleware: [],
    listenSpy: vi.fn(),
    lastListenPort: null,
    lastListenCallback: null,
  };
}

async function loadServer(): Promise<void> {
  // Importing the module triggers all top-level wiring (use/get/post/listen).
  await import('./server.js');
}

function findRoute(method: 'get' | 'post', path: string): FakeRoute {
  const route = fakeApp.routes.find((r) => r.method === method && r.path === path);
  if (!route) {
    throw new Error(`Route not registered: ${method.toUpperCase()} ${path}`);
  }
  return route;
}

// ---------------------------------------------------------------------------
// Env snapshot/restore
// ---------------------------------------------------------------------------

const ENV_KEYS = [
  'NODE_ENV',
  'ALLOW_DEV_BYPASS',
  'WORKER_PORT',
  'OIDC_EXPECTED_AUDIENCE',
  'OIDC_EXPECTED_ISSUER',
  'WORKER_VERSION',
] as const;

describe('audit-worker server.ts', () => {
  const originalEnv: Record<string, string | undefined> = {};
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    for (const k of ENV_KEYS) originalEnv[k] = process.env[k];
    fakeApp = freshFakeApp();
    oidcMiddlewareMock.mockClear();
    oidcFactoryMock.mockClear();
    oidcFactoryMock.mockReturnValue(oidcMiddlewareMock);
    runPipelineMock.mockReset();
    runPipelineMock.mockResolvedValue(undefined);
    safeParseMock.mockReset();
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    vi.resetModules();
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (originalEnv[k] === undefined) delete process.env[k];
      else process.env[k] = originalEnv[k];
    }
    stderrSpy.mockRestore();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // App startup / route wiring
  // -------------------------------------------------------------------------

  describe('startup wiring', () => {
    it('registers POST /run route on import', async () => {
      safeParseMock.mockReturnValue({ success: true, data: { runId: 'r-1' } });
      await loadServer();

      const post = fakeApp.routes.find((r) => r.method === 'post' && r.path === '/run');
      expect(post).toBeDefined();
    });

    it('registers GET /healthz health-check route on import', async () => {
      await loadServer();

      const health = fakeApp.routes.find((r) => r.method === 'get' && r.path === '/healthz');
      expect(health).toBeDefined();
    });

    it('GET /healthz responds 200 with status: ok', async () => {
      await loadServer();

      const route = findRoute('get', '/healthz');
      const res = makeRes();
      const handler = route.handlers[route.handlers.length - 1]!;
      handler(makeReq(), res);

      expect(res.statusCode).toBe(200);
      // The readiness contract is asserted in detail by the dedicated
      // `GET /healthz readiness contract` describe block; here we only
      // pin the smoke-level invariant that the route returns status: ok.
      expect(res.body).toMatchObject({ status: 'ok' });
    });

    it('mounts OIDC middleware before the /run handler', async () => {
      await loadServer();

      const post = findRoute('post', '/run');
      // Express signature: app.post(path, middleware, handler)
      // → handlers[0] is the OIDC middleware, handlers[last] is the request handler.
      expect(post.handlers.length).toBeGreaterThanOrEqual(2);
      expect(post.handlers[0]).toBe(oidcMiddlewareMock);
    });

    it('calls oidcMiddlewareFromEnv() exactly once at startup', async () => {
      await loadServer();
      expect(oidcFactoryMock).toHaveBeenCalledTimes(1);
    });

    it('attaches express.json body parser via app.use', async () => {
      await loadServer();
      // The first registered middleware is express.json({ limit: '256kb' }).
      expect(fakeApp.middleware[0]).toBe(jsonMiddlewareSentinel);
    });
  });

  // -------------------------------------------------------------------------
  // GET /healthz readiness contract
  //
  // The health endpoint doubles as a readiness probe for SRE/operators. It
  // must expose enough environmental context to disambiguate "process is up"
  // from "process is configured to accept production traffic". These tests
  // pin the wire contract so the shape can't silently drift.
  // -------------------------------------------------------------------------

  describe('GET /healthz readiness contract', () => {
    async function invokeHealthHandler(): Promise<FakeRes> {
      await loadServer();
      const route = findRoute('get', '/healthz');
      const res = makeRes();
      const handler = route.handlers[route.handlers.length - 1]!;
      handler(makeReq(), res);
      return res;
    }

    it('returns the full readiness payload with sensible defaults when no env is set', async () => {
      delete process.env.NODE_ENV;
      delete process.env.ALLOW_DEV_BYPASS;
      delete process.env.OIDC_EXPECTED_AUDIENCE;
      delete process.env.OIDC_EXPECTED_ISSUER;
      delete process.env.WORKER_VERSION;

      const res = await invokeHealthHandler();

      expect(res.statusCode).toBe(200);
      const body = res.body as {
        status: string;
        service: string;
        version: string;
        nodeEnv: string;
        oidcEnabled: boolean;
        devBypassActive: boolean;
        timestamp: string;
      };
      expect(body.status).toBe('ok');
      expect(body.service).toBe('audit-worker');
      expect(body.version).toBe('0.1.0');
      expect(body.nodeEnv).toBe('undefined');
      expect(body.oidcEnabled).toBe(false);
      expect(body.devBypassActive).toBe(false);
      // Timestamp must round-trip through Date as a valid ISO 8601 string.
      expect(typeof body.timestamp).toBe('string');
      expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
      expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    });

    it('reports oidcEnabled=true when both OIDC env vars are configured', async () => {
      process.env.OIDC_EXPECTED_AUDIENCE = 'https://audit-worker.example.com';
      process.env.OIDC_EXPECTED_ISSUER = 'https://accounts.google.com';
      delete process.env.NODE_ENV;
      delete process.env.ALLOW_DEV_BYPASS;

      const res = await invokeHealthHandler();

      expect(res.statusCode).toBe(200);
      const body = res.body as { oidcEnabled: boolean; devBypassActive: boolean };
      expect(body.oidcEnabled).toBe(true);
      // Dev bypass must remain off when ALLOW_DEV_BYPASS is unset.
      expect(body.devBypassActive).toBe(false);
    });

    it('reports devBypassActive=true in development with ALLOW_DEV_BYPASS=1', async () => {
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_DEV_BYPASS = '1';
      delete process.env.OIDC_EXPECTED_AUDIENCE;
      delete process.env.OIDC_EXPECTED_ISSUER;

      const res = await invokeHealthHandler();

      expect(res.statusCode).toBe(200);
      const body = res.body as {
        nodeEnv: string;
        oidcEnabled: boolean;
        devBypassActive: boolean;
      };
      expect(body.nodeEnv).toBe('development');
      expect(body.devBypassActive).toBe(true);
      // OIDC env vars unset → oidcEnabled must be false even while bypass is on.
      expect(body.oidcEnabled).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Listen callback
  // -------------------------------------------------------------------------

  describe('app.listen callback', () => {
    it('listens on WORKER_PORT when set', async () => {
      process.env.WORKER_PORT = '9999';
      await loadServer();
      expect(fakeApp.lastListenPort).toBe(9999);
    });

    it('falls back to port 8080 when WORKER_PORT is unset', async () => {
      delete process.env.WORKER_PORT;
      await loadServer();
      expect(fakeApp.lastListenPort).toBe(8080);
    });

    it('startup log includes devBypassActive=false and nodeEnv when in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_DEV_BYPASS = '1';
      await loadServer();

      const logged = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(logged).toContain('audit-worker listening');
      expect(logged).toContain('"devBypassActive":false');
      expect(logged).toContain('"nodeEnv":"production"');
    });

    it('startup log shows devBypassActive=true in non-prod with ALLOW_DEV_BYPASS=1', async () => {
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_DEV_BYPASS = '1';
      await loadServer();

      const logged = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(logged).toContain('"devBypassActive":true');
      expect(logged).toContain('"nodeEnv":"development"');
    });

    it('startup log shows nodeEnv=undefined string when NODE_ENV is unset', async () => {
      delete process.env.NODE_ENV;
      delete process.env.ALLOW_DEV_BYPASS;
      await loadServer();

      const logged = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(logged).toContain('"nodeEnv":"undefined"');
      expect(logged).toContain('"devBypassActive":false');
    });
  });

  // -------------------------------------------------------------------------
  // POST /run handler — valid payload
  // -------------------------------------------------------------------------

  describe('POST /run handler — valid payload', () => {
    async function invokeRunHandler(body: unknown): Promise<FakeRes> {
      await loadServer();
      const post = findRoute('post', '/run');
      const handler = post.handlers[post.handlers.length - 1]!;
      const res = makeRes();
      await handler(makeReq(body), res);
      return res;
    }

    it('returns 200 with { accepted: true, runId } on valid payload', async () => {
      safeParseMock.mockReturnValue({
        success: true,
        data: { runId: 'run-42', projectId: 'p', ownerId: 'o' },
      });

      const res = await invokeRunHandler({ runId: 'run-42' });

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ accepted: true, runId: 'run-42' });
    });

    it('invokes runPipeline with the parsed payload after responding', async () => {
      const payload = { runId: 'run-7', projectId: 'proj', ownerId: 'owner' };
      safeParseMock.mockReturnValue({ success: true, data: payload });

      await invokeRunHandler({ anything: true });
      // Allow the fire-and-forget pipeline call to settle.
      await new Promise((r) => setImmediate(r));

      expect(runPipelineMock).toHaveBeenCalledTimes(1);
      expect(runPipelineMock).toHaveBeenCalledWith(payload);
    });

    it('logs to stderr when runPipeline rejects (pipeline crash outside markRunFailed)', async () => {
      safeParseMock.mockReturnValue({
        success: true,
        data: { runId: 'run-boom' },
      });
      runPipelineMock.mockRejectedValueOnce(new Error('boom'));

      await invokeRunHandler({});
      // Let the rejection bubble through the try/catch.
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));

      const logged = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(logged).toContain('Pipeline crashed outside markRunFailed');
      expect(logged).toContain('"runId":"run-boom"');
      expect(logged).toContain('"error":"boom"');
    });

    it('serialises non-Error rejections as String(err) in the crash log', async () => {
      safeParseMock.mockReturnValue({
        success: true,
        data: { runId: 'run-str' },
      });
      runPipelineMock.mockRejectedValueOnce('string-failure');

      await invokeRunHandler({});
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));

      const logged = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(logged).toContain('"error":"string-failure"');
    });
  });

  // -------------------------------------------------------------------------
  // POST /run handler — invalid payload
  // -------------------------------------------------------------------------

  describe('POST /run handler — invalid payload', () => {
    it('returns 400 INVALID_INPUT when schema.safeParse fails', async () => {
      const flatten = vi.fn(() => ({
        formErrors: [],
        fieldErrors: { runId: ['Required'] },
      }));
      safeParseMock.mockReturnValue({
        success: false,
        error: { flatten },
      });

      await loadServer();
      const post = findRoute('post', '/run');
      const handler = post.handlers[post.handlers.length - 1]!;
      const res = makeRes();
      await handler(makeReq({ bogus: true }), res);

      expect(res.statusCode).toBe(400);
      const body = res.body as { error: { code: string; message: string; issues: unknown } };
      expect(body.error.code).toBe('INVALID_INPUT');
      expect(body.error.message).toContain('Cloud Tasks payload invalid');
      expect(flatten).toHaveBeenCalled();
    });

    it('does NOT invoke runPipeline when payload is invalid', async () => {
      safeParseMock.mockReturnValue({
        success: false,
        error: { flatten: () => ({ formErrors: [], fieldErrors: {} }) },
      });

      await loadServer();
      const post = findRoute('post', '/run');
      const handler = post.handlers[post.handlers.length - 1]!;
      await handler(makeReq({}), makeRes());
      await new Promise((r) => setImmediate(r));

      expect(runPipelineMock).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // POST /run — Cloud Tasks contract test (A2)
  //
  // NOTE: The A2 ticket description references "202 Accepted + { ok, auditRunId }".
  // The actual implemented contract in `server.ts` is:
  //     res.status(200).json({ accepted: true, runId })
  // Per task scope ("server.ts production 코드 수정 금지 — 테스트만 추가"), these
  // tests MUST match the existing implemented contract. We document this so a
  // future ticket can decide whether to migrate server.ts to the 202/auditRunId
  // shape; until then, tests pin the current contract to prevent silent drift.
  // -------------------------------------------------------------------------

  describe('POST /run — Cloud Tasks contract', () => {
    async function invokeRunHandler(body: unknown): Promise<FakeRes> {
      await loadServer();
      const post = findRoute('post', '/run');
      const handler = post.handlers[post.handlers.length - 1]!;
      const res = makeRes();
      await handler(makeReq(body), res);
      return res;
    }

    it('responds 200 with { accepted: true, runId } for a valid Cloud Tasks payload', async () => {
      const payload = {
        runId: 'run-contract-001',
        projectId: 'proj-1',
        ownerId: 'owner-1',
        repoUrl: 'https://github.com/example/repo',
        deployUrl: 'https://example.com',
      };
      safeParseMock.mockReturnValue({ success: true, data: payload });

      const res = await invokeRunHandler(payload);

      // Pin the exact wire contract Cloud Tasks observes: status + body shape.
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ accepted: true, runId: 'run-contract-001' });
    });

    it('responds 400 when the payload fails schema validation (e.g. missing repoUrl)', async () => {
      // Simulate AuditTaskPayloadSchema rejecting a payload because repoUrl is absent.
      const flatten = vi.fn(() => ({
        formErrors: [],
        fieldErrors: { repoUrl: ['Required'] },
      }));
      safeParseMock.mockReturnValue({ success: false, error: { flatten } });

      const res = await invokeRunHandler({
        runId: 'run-no-repo',
        projectId: 'p',
        ownerId: 'o',
        // repoUrl intentionally omitted
      });

      expect(res.statusCode).toBe(400);
      const body = res.body as {
        error: { code: string; message: string; issues: unknown };
      };
      expect(body.error.code).toBe('INVALID_INPUT');
      expect(body.error.message).toContain('Cloud Tasks payload invalid');
    });

    it('responds 400 when express.json delivered a malformed body that safeParse rejects', async () => {
      // express.json() would normally surface a SyntaxError before reaching the
      // handler, but Cloud Tasks can also deliver semantically malformed JSON
      // (e.g. a string instead of an object). In both cases the handler must
      // refuse the payload via safeParse and emit 400 INVALID_INPUT.
      const flatten = vi.fn(() => ({
        formErrors: ['Expected object, received string'],
        fieldErrors: {},
      }));
      safeParseMock.mockReturnValue({ success: false, error: { flatten } });

      const res = await invokeRunHandler('not-an-object');

      expect(res.statusCode).toBe(400);
      const body = res.body as { error: { code: string; issues: unknown } };
      expect(body.error.code).toBe('INVALID_INPUT');
      expect(flatten).toHaveBeenCalled();
    });

    it('dispatches the pipeline runner exactly once (background invocation contract)', async () => {
      const payload = {
        runId: 'run-pipeline-fire',
        projectId: 'proj-2',
        ownerId: 'owner-2',
        repoUrl: 'https://github.com/example/repo',
      };
      safeParseMock.mockReturnValue({ success: true, data: payload });

      const res = await invokeRunHandler(payload);
      // Allow the post-response fire-and-forget pipeline call to settle.
      await new Promise((r) => setImmediate(r));

      expect(res.statusCode).toBe(200);
      expect(runPipelineMock).toHaveBeenCalledTimes(1);
      expect(runPipelineMock).toHaveBeenCalledWith(payload);
    });
  });
});
