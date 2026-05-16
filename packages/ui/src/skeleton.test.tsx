import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  it('renders a div with aria-hidden', () => {
    const html = renderToStaticMarkup(<Skeleton size="h-4 w-32" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toMatch(/<div/);
  });

  it('uses --app-border token (no skeleton-sweep/aurora)', () => {
    const html = renderToStaticMarkup(<Skeleton />);
    expect(html).toContain('--app-border');
    expect(html).not.toMatch(/skeleton-sweep|aurora/);
  });
});
