import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Progress } from './progress';

describe('Progress', () => {
  it('renders progressbar with aria-valuenow clamped to [0,100]', () => {
    const html = renderToStaticMarkup(<Progress value={150} />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="100"');
  });

  it('uses --app-* tokens (no gradient-aurora)', () => {
    const html = renderToStaticMarkup(<Progress value={50} />);
    expect(html).toContain('--app-fg');
    expect(html).toContain('--app-border');
    expect(html).not.toMatch(/gradient-aurora|aurora/);
  });
});
