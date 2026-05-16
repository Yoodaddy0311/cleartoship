// Unit tests for apiFetch — auth header injection, error parsing, option handling.
// Firebase client SDK is mocked so getIdToken can be controlled per-test.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getIdTokenMock } = vi.hoisted(() => ({ getIdTokenMock: vi.fn() }));

vi.mock('@/lib/firebase/auth-init', () => ({
  getIdToken: getIdTokenMock,
}));

const FAKE_TOKEN_A = 'fake-jwt-aaa';
const FAKE_TOKEN_B = 'fake-jwt-bbb';
const FAKE_TOKEN_C = 'fake-jwt-ccc';
const FAKE_TOKEN_D = 'fake-jwt-ddd';
const FAKE_TOKEN_E = 'fake-jwt-eee';

type FetchMock = ReturnType<typeof vi.fn>;

function mockFetch(response: {
  ok: boolean;
  status: number;
  body?: unknown;
  jsonThrows?: boolean;
}): FetchMock {
  const fetchMock = vi.fn(async () => ({
    ok: response.ok,
    status: response.status,
    json: async () => {
      if (response.jsonThrows) throw new Error('not json');
      return response.body ?? {};
    },
  })) as unknown as FetchMock;
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function getInit(fetchMock: FetchMock): RequestInit {
  const call = fetchMock.mock.calls[0] as [string, RequestInit] | undefined;
  if (!call) throw new Error('fetch was not called');
  return call[1];
}

describe('apiFetch — auth header injection', () => {
  beforeEach(() => {
    vi.resetModules();
    getIdTokenMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('attaches Authorization header when getIdToken returns a value', async () => {
    getIdTokenMock.mockResolvedValue(FAKE_TOKEN_A);
    const fetchMock = mockFetch({ ok: true, status: 200, body: { ok: true } });

    const { apiFetch } = await import('./client');
    const out = await apiFetch<{ ok: boolean }>('/api/foo');

    expect(out).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = getInit(fetchMock);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${FAKE_TOKEN_A}`,
    );
  });

  it('omits Authorization header when getIdToken returns null', async () => {
    getIdTokenMock.mockResolvedValue(null);
    const fetchMock = mockFetch({ ok: true, status: 204 });

    const { apiFetch } = await import('./client');
    await apiFetch<void>('/api/foo');

    const init = getInit(fetchMock);
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('uses explicit authToken override when provided', async () => {
    getIdTokenMock.mockResolvedValue(FAKE_TOKEN_B);
    const fetchMock = mockFetch({ ok: true, status: 200, body: {} });

    const { apiFetch } = await import('./client');
    await apiFetch('/api/foo', { authToken: FAKE_TOKEN_C });

    expect(getIdTokenMock).not.toHaveBeenCalled();
    const init = getInit(fetchMock);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${FAKE_TOKEN_C}`,
    );
  });

  it('skips auth injection entirely when skipAuth=true', async () => {
    getIdTokenMock.mockResolvedValue(FAKE_TOKEN_D);
    const fetchMock = mockFetch({ ok: true, status: 200, body: {} });

    const { apiFetch } = await import('./client');
    await apiFetch('/api/foo', { skipAuth: true });

    expect(getIdTokenMock).not.toHaveBeenCalled();
    const init = getInit(fetchMock);
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('respects caller-supplied Authorization header (does not overwrite)', async () => {
    getIdTokenMock.mockResolvedValue(FAKE_TOKEN_E);
    const fetchMock = mockFetch({ ok: true, status: 200, body: {} });

    const { apiFetch } = await import('./client');
    await apiFetch('/api/foo', {
      headers: { Authorization: `Bearer ${FAKE_TOKEN_A}` },
    });

    expect(getIdTokenMock).not.toHaveBeenCalled();
    const init = getInit(fetchMock);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${FAKE_TOKEN_A}`,
    );
  });

  it('handles caller Authorization header via Headers instance', async () => {
    getIdTokenMock.mockResolvedValue(FAKE_TOKEN_E);
    const fetchMock = mockFetch({ ok: true, status: 200, body: {} });

    const { apiFetch } = await import('./client');
    const headers = new Headers({ Authorization: `Bearer ${FAKE_TOKEN_A}` });
    await apiFetch('/api/foo', { headers });

    expect(getIdTokenMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('handles caller Authorization header via array form', async () => {
    getIdTokenMock.mockResolvedValue(FAKE_TOKEN_E);
    const fetchMock = mockFetch({ ok: true, status: 200, body: {} });

    const { apiFetch } = await import('./client');
    await apiFetch('/api/foo', {
      headers: [['Authorization', `Bearer ${FAKE_TOKEN_A}`]],
    });

    expect(getIdTokenMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('apiFetch — error parsing', () => {
  beforeEach(() => {
    vi.resetModules();
    getIdTokenMock.mockReset();
    getIdTokenMock.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws ApiHttpError with parsed code/message when body matches ErrorBodySchema', async () => {
    mockFetch({
      ok: false,
      status: 401,
      body: { error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다' } },
    });

    const { apiFetch, ApiHttpError } = await import('./client');
    await expect(apiFetch('/api/secret')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
      message: '인증이 필요합니다',
    });
    await expect(apiFetch('/api/secret')).rejects.toBeInstanceOf(ApiHttpError);
  });

  it('throws generic ApiHttpError (code=UNKNOWN) when body is not JSON', async () => {
    mockFetch({ ok: false, status: 500, jsonThrows: true });

    const { apiFetch, ApiHttpError } = await import('./client');
    const err = (await apiFetch('/api/boom').catch((e) => e)) as InstanceType<
      typeof ApiHttpError
    >;
    expect(err).toBeInstanceOf(ApiHttpError);
    expect(err.status).toBe(500);
    expect(err.code).toBe('UNKNOWN');
    expect(err.message).toMatch(/500/);
  });

  it('throws generic ApiHttpError when body does not match ErrorBodySchema', async () => {
    mockFetch({ ok: false, status: 503, body: { not: 'an-error-envelope' } });

    const { apiFetch, ApiHttpError } = await import('./client');
    const err = (await apiFetch('/api/boom').catch((e) => e)) as InstanceType<
      typeof ApiHttpError
    >;
    expect(err).toBeInstanceOf(ApiHttpError);
    expect(err.code).toBe('UNKNOWN');
  });

  it('returns undefined for 204 No Content', async () => {
    mockFetch({ ok: true, status: 204 });

    const { apiFetch } = await import('./client');
    const out = await apiFetch<void>('/api/empty');
    expect(out).toBeUndefined();
  });

  it('preserves Content-Type and Accept default headers', async () => {
    const fetchMock = mockFetch({ ok: true, status: 200, body: {} });

    const { apiFetch } = await import('./client');
    await apiFetch('/api/foo');

    const init = getInit(fetchMock);
    const h = init.headers as Record<string, string>;
    expect(h['Content-Type']).toBe('application/json');
    expect(h.Accept).toBe('application/json');
  });

  it('passes body / method through unchanged', async () => {
    const fetchMock = mockFetch({ ok: true, status: 200, body: {} });

    const { apiFetch } = await import('./client');
    const payload = JSON.stringify({ x: 1 });
    await apiFetch('/api/foo', { method: 'POST', body: payload });

    const init = getInit(fetchMock);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(payload);
    expect(init.cache).toBe('no-store');
  });
});
