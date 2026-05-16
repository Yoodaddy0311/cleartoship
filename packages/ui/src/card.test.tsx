import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Card, CardTitle } from './card';

describe('Card', () => {
  it('renders children', () => {
    const html = renderToStaticMarkup(<Card>hello</Card>);
    expect(html).toContain('hello');
  });

  it('uses app surface/border tokens (no legacy aurora/glass)', () => {
    const html = renderToStaticMarkup(
      <Card>
        <CardTitle>Title</CardTitle>
      </Card>
    );
    expect(html).toContain('--app-surface');
    expect(html).toContain('--app-border');
    expect(html).not.toMatch(/aurora|glass-card|color-bg-elevated/);
  });
});
