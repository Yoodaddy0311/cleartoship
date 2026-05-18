import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/components/common/header', () => ({
  Header: () => null,
}));

vi.mock('@/components/common/footer', () => ({
  Footer: () => null,
}));

vi.mock('./globals.css', () => ({}));

// Hoisted mutable cookie jar so individual tests can flip the active locale
// before invoking `generateMetadata()`. `vi.mock` factories execute before
// module imports, so the jar must be created via `vi.hoisted` to be in scope.
const cookieJar = vi.hoisted(() => new Map<string, string>());

// `headers()` requires a Next.js request scope. In unit tests we replace it with
// a stub returning the same per-request `x-nonce` value the middleware would set.
// In Next.js 15 `headers()` is async, so the stub returns a Promise. The
// `cookies()` stub reads from the hoisted jar so tests can drive locale.
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (_k: string) => 'test-nonce-AAAAAAAAAAAAAAAA==' }),
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
  }),
}));

import RootLayout, { generateMetadata } from './layout';
import { ko } from '@/lib/i18n/ko';
import { en } from '@/lib/i18n/en';

beforeEach(() => {
  cookieJar.clear();
});

// `RootLayout` is an async Server Component (it awaits `headers()` to read the
// CSP nonce set by middleware). `renderToStaticMarkup` does not support async
// components directly, so we resolve the element first and then render its result.
async function renderLayout(children: React.ReactNode): Promise<string> {
  const element = await (RootLayout as unknown as (props: {
    children: React.ReactNode;
  }) => Promise<React.ReactElement>)({ children });
  return renderToStaticMarkup(element);
}

describe('RootLayout', () => {
  it('renders an html document with main landmark', async () => {
    const html = await renderLayout(<p>child</p>);
    expect(html).toContain('<html');
    expect(html).toContain('lang="ko"');
    expect(html).toContain('id="main-content"');
    expect(html).toContain('child');
  });

  it('exposes a skip-link pointing to #main-content', async () => {
    const html = await renderLayout(<span />);
    expect(html).toMatch(/class="skip-link"[^>]*href="#main-content"|href="#main-content"[^>]*class="skip-link"/);
  });
});

// L-P1-5 Wave 3 follow-up: `generateMetadata()` runs per-request and must
// reflect the cookie-driven locale so LangToggle keeps <title>/OG tags in
// sync with the rest of the UI. The two scenarios below pin the ko default
// path (no cookie) and the en path (cookie set) against the source-of-truth
// i18n maps so a future schema rename surfaces here too.
describe('generateMetadata', () => {
  it('returns Korean title/description/openGraph when locale cookie is absent (ko default)', async () => {
    const meta = await generateMetadata();
    expect(meta.title).toBe(ko['app.title']);
    expect(meta.description).toBe(ko['app.description']);
    expect(meta.openGraph).toMatchObject({
      title: ko['app.title'],
      description: ko['app.description'],
      type: 'website',
      locale: 'ko_KR',
    });
  });

  it('returns English title/description/openGraph when cookie selects en', async () => {
    cookieJar.set('cts.locale', 'en');
    const meta = await generateMetadata();
    expect(meta.title).toBe(en['app.title']);
    expect(meta.description).toBe(en['app.description']);
    expect(meta.openGraph).toMatchObject({
      title: en['app.title'],
      description: en['app.description'],
      type: 'website',
      locale: 'en_US',
    });
  });
});
