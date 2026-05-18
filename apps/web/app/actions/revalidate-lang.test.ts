// Sprint 4 L-P1-5 — server action smoke tests. Cookie + cache primitives
// are mocked so the action runs in a plain Node test environment.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const cookieJar = new Map<string, string>();
const revalidatePathSpy = vi.fn();

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathSpy(...args),
}));

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
  revalidatePathSpy.mockReset();
});

describe('revalidateLang', () => {
  it('sets the cookie and revalidates the root layout for a valid locale', async () => {
    const { revalidateLang } = await import('./revalidate-lang.js');
    await revalidateLang('en');
    expect(cookieJar.get('cts.locale')).toBe('en');
    expect(revalidatePathSpy).toHaveBeenCalledWith('/', 'layout');
  });

  it('accepts ko (default locale) without dropping the cookie', async () => {
    const { revalidateLang } = await import('./revalidate-lang.js');
    await revalidateLang('ko');
    expect(cookieJar.get('cts.locale')).toBe('ko');
    expect(revalidatePathSpy).toHaveBeenCalledTimes(1);
  });

  it('throws on an unsupported locale and does not revalidate', async () => {
    const { revalidateLang } = await import('./revalidate-lang.js');
    await expect(
      // @ts-expect-error — runtime zod guard
      revalidateLang('fr'),
    ).rejects.toThrow();
    expect(revalidatePathSpy).not.toHaveBeenCalled();
    expect(cookieJar.has('cts.locale')).toBe(false);
  });
});
