import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EvidenceCard } from './evidence-card';

describe('EvidenceCard', () => {
  it('renders file:line label and snippet inside a figure', () => {
    const html = renderToStaticMarkup(
      <EvidenceCard
        filePath="src/foo.ts"
        lineStart={10}
        lineEnd={12}
        snippet="const x = 1;"
      />
    );
    expect(html).toContain('<figure');
    expect(html).toContain('src/foo.ts:10-12');
    expect(html).toContain('const x = 1;');
  });

  it('uses --app-* tokens for surface and border (no legacy color-bg-elevated)', () => {
    const html = renderToStaticMarkup(<EvidenceCard caption="x" />);
    expect(html).toContain('--app-surface');
    expect(html).toContain('--app-border');
    expect(html).not.toMatch(/color-bg-elevated|color-border-subtle|aurora/);
  });
});
