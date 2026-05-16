import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeatureGraphNode } from './feature-graph-node';

describe('FeatureGraphNode', () => {
  it('renders the label and an icon', () => {
    const html = renderToStaticMarkup(
      <FeatureGraphNode type="feature" status="complete" label="Checkout" />
    );
    expect(html).toContain('Checkout');
    expect(html).toMatch(/<svg/);
  });

  it('communicates status via text (not color alone) for a11y', () => {
    const html = renderToStaticMarkup(
      <FeatureGraphNode type="api" status="missing" label="Pay API" />
    );
    expect(html).toContain('미구현');
  });

  it('uses --sev-* and --app-* tokens (no legacy color-status-*)', () => {
    const html = renderToStaticMarkup(
      <FeatureGraphNode type="feature" status="missing" label="X" />
    );
    expect(html).toContain('--sev-p0');
    expect(html).toContain('--app-surface');
    expect(html).not.toMatch(/color-status-|color-aurora-violet/);
  });
});
