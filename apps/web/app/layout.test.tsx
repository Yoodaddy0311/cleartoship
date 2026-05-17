import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/components/common/header', () => ({
  Header: () => null,
}));

vi.mock('@/components/common/footer', () => ({
  Footer: () => null,
}));

vi.mock('./globals.css', () => ({}));

// `headers()` requires a Next.js request scope. In unit tests we replace it with
// a stub returning the same per-request `x-nonce` value the middleware would set.
// In Next.js 15 `headers()` is async, so the stub returns a Promise.
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (_k: string) => 'test-nonce-AAAAAAAAAAAAAAAA==' }),
}));

import RootLayout from './layout';

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
