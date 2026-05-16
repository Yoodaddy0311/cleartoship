import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './badge';

describe('Badge', () => {
  it('renders the label inside a span', () => {
    render(<Badge variant="P0">P0</Badge>);
    const el = screen.getByText('P0');
    expect(el.tagName).toBe('SPAN');
  });

  it('maps severity P0 → var(--sev-p0) on color, background, and border', () => {
    render(<Badge variant="P0">P0</Badge>);
    const el = screen.getByText('P0');
    const style = el.getAttribute('style') ?? '';
    expect(style).toContain('var(--sev-p0)');
    expect(style).toMatch(/background-color:\s*color-mix\(in oklch, var\(--sev-p0\) 12%/);
    expect(style).toMatch(/border:\s*1px solid color-mix\(in oklch, var\(--sev-p0\) 24%/);
    expect(style).not.toContain('--color-severity-p0');
  });

  it('maps severity P1 to --sev-p1 (variant-to-token mapping is exhaustive)', () => {
    render(<Badge variant="P1">P1</Badge>);
    const style = screen.getByText('P1').getAttribute('style') ?? '';
    expect(style).toContain('var(--sev-p1)');
  });

  it('neutral variant falls back to --app-* tokens (no severity color)', () => {
    render(<Badge variant="neutral">N/A</Badge>);
    const style = screen.getByText('N/A').getAttribute('style') ?? '';
    expect(style).toContain('var(--app-fg-muted)');
    expect(style).toContain('var(--app-bg-soft)');
    expect(style).toContain('var(--app-border)');
    expect(style).not.toContain('--sev-');
  });
});
