import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Input, Textarea } from './input';

describe('Input', () => {
  it('renders an input with label association', () => {
    const html = renderToStaticMarkup(<Input label="Email" id="email" />);
    expect(html).toContain('<label');
    expect(html).toContain('for="email"');
    expect(html).toMatch(/<input[^>]*id="email"/);
  });

  it('uses --app-* tokens (no legacy color-bg-elevated/aurora-violet)', () => {
    const html = renderToStaticMarkup(<Input label="L" />);
    expect(html).toContain('--app-surface');
    expect(html).toContain('--app-border');
    expect(html).not.toMatch(/color-bg-elevated|aurora-violet/);
  });

  it('Textarea uses --app-* tokens', () => {
    const html = renderToStaticMarkup(<Textarea label="L" />);
    expect(html).toContain('--app-surface');
    expect(html).not.toMatch(/color-bg-elevated|aurora-violet/);
  });
});
