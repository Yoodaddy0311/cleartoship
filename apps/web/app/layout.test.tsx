import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/components/common/header', () => ({
  Header: () => null,
}));

vi.mock('@/components/common/footer', () => ({
  Footer: () => null,
}));

vi.mock('./globals.css', () => ({}));

import RootLayout from './layout';

describe('RootLayout', () => {
  it('renders an html document with main landmark', () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <p>child</p>
      </RootLayout>
    );
    expect(html).toContain('<html');
    expect(html).toContain('lang="ko"');
    expect(html).toContain('id="main-content"');
    expect(html).toContain('child');
  });

  it('exposes a skip-link pointing to #main-content', () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <span />
      </RootLayout>
    );
    expect(html).toMatch(/class="skip-link"[^>]*href="#main-content"|href="#main-content"[^>]*class="skip-link"/);
  });
});
