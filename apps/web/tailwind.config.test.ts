import { describe, expect, it } from 'vitest';
import config from './tailwind.config';

describe('tailwind.config', () => {
  it('extends colors with marketing, app, and severity tokens', () => {
    const colors = (config.theme?.extend?.colors ?? {}) as Record<string, string>;

    // Marketing surface
    expect(colors['mk-bg']).toBe('var(--mk-bg)');
    expect(colors['mk-fg']).toBe('var(--mk-fg)');
    expect(colors['mk-accent']).toBe('var(--mk-accent)');

    // App surface
    expect(colors['app-bg']).toBe('var(--app-bg)');
    expect(colors['app-surface']).toBe('var(--app-surface)');
    expect(colors['app-fg']).toBe('var(--app-fg)');
    expect(colors['app-border']).toBe('var(--app-border)');

    // Severity
    expect(colors['sev-p0']).toBe('var(--sev-p0)');
    expect(colors['sev-p1']).toBe('var(--sev-p1)');
    expect(colors['sev-p2']).toBe('var(--sev-p2)');
    expect(colors['sev-p3']).toBe('var(--sev-p3)');
  });

  it('maps the marketing radius, shadow, gradient, and font tokens', () => {
    const radius = (config.theme?.extend?.borderRadius ?? {}) as Record<string, string>;
    const shadow = (config.theme?.extend?.boxShadow ?? {}) as Record<string, string>;
    const bgImage = (config.theme?.extend?.backgroundImage ?? {}) as Record<string, string>;
    const fontFamily = (config.theme?.extend?.fontFamily ?? {}) as Record<string, string[]>;

    expect(radius['mk']).toBe('var(--mk-radius)');
    expect(radius['mk-pill']).toBe('var(--mk-radius-pill)');
    expect(radius['app']).toBe('var(--app-radius)');

    expect(shadow['mk']).toBe('var(--mk-shadow)');
    expect(shadow['app-card']).toBe('var(--app-shadow-card)');

    expect(bgImage['mk-gradient']).toBe('var(--mk-gradient)');
    expect(fontFamily['display']).toEqual(['var(--mk-font-display)']);
  });

  it('exposes display fontSize tokens (md, display-sm/md/lg) for legacy callers', () => {
    const fontSize = (config.theme?.extend?.fontSize ?? {}) as Record<string, unknown>;
    expect(fontSize['md']).toEqual(['1rem', { lineHeight: '1.6' }]);
    expect(fontSize['display-sm']).toEqual(['1.5rem', { lineHeight: '1.3', fontWeight: '600' }]);
    expect(fontSize['display-md']).toEqual(['2rem', { lineHeight: '1.25', fontWeight: '600' }]);
    expect(fontSize['display-lg']).toEqual(['2.75rem', { lineHeight: '1.15', fontWeight: '600' }]);
  });

  it('scans app, components, and ui package sources', () => {
    expect(config.content).toEqual(
      expect.arrayContaining([
        './app/**/*.{ts,tsx,mdx}',
        './components/**/*.{ts,tsx,mdx}',
        '../../packages/ui/src/**/*.{ts,tsx}',
      ])
    );
  });
});
