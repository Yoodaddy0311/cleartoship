// Sprint 4 L-P1-5 — locale infra unit tests. Cookie I/O is mocked through
// `next/headers` so the helpers can be exercised without a Next.js request
// scope.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mock store — `vi.mock` factories run before module imports, so any
// state they reference must be lazily created at call time.
const cookieJar = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
  }),
}));

beforeEach(() => {
  cookieJar.clear();
});

describe('normalizeLocale', () => {
  it('returns ko when value is undefined', async () => {
    const { normalizeLocale, DEFAULT_LOCALE } = await import('./locale.js');
    expect(normalizeLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(normalizeLocale(null)).toBe(DEFAULT_LOCALE);
  });

  it('returns ko when value is unrecognised', async () => {
    const { normalizeLocale } = await import('./locale.js');
    expect(normalizeLocale('fr')).toBe('ko');
    expect(normalizeLocale('')).toBe('ko');
  });

  it('passes supported locales through', async () => {
    const { normalizeLocale } = await import('./locale.js');
    expect(normalizeLocale('ko')).toBe('ko');
    expect(normalizeLocale('en')).toBe('en');
  });
});

describe('isLocale', () => {
  it('accepts the supported set only', async () => {
    const { isLocale } = await import('./locale.js');
    expect(isLocale('ko')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('ja')).toBe(false);
    expect(isLocale(42)).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe('getLocale (server)', () => {
  it('falls back to ko when the cookie is absent', async () => {
    const { getLocale } = await import('./locale.js');
    expect(await getLocale()).toBe('ko');
  });

  it('reads the cookie when present and recognised', async () => {
    cookieJar.set('cts.locale', 'en');
    const { getLocale } = await import('./locale.js');
    expect(await getLocale()).toBe('en');
  });

  it('falls back to ko when the cookie has a bogus value', async () => {
    cookieJar.set('cts.locale', 'pirate-speak');
    const { getLocale } = await import('./locale.js');
    expect(await getLocale()).toBe('ko');
  });
});

describe('setLocale (server)', () => {
  it('persists supported locales into the cookie jar', async () => {
    const { setLocale } = await import('./locale.js');
    await setLocale('en');
    expect(cookieJar.get('cts.locale')).toBe('en');
  });

  it('throws on unsupported locales rather than corrupting the cookie', async () => {
    const { setLocale } = await import('./locale.js');
    await expect(
      // @ts-expect-error — runtime guard test
      setLocale('xx'),
    ).rejects.toThrow(/Unsupported locale/);
    expect(cookieJar.has('cts.locale')).toBe(false);
  });
});
