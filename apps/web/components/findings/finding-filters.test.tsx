// FindingFilters tests — sibling-located on purpose.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@cleartoship/ui', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@/lib/format/severity', () => ({
  SEVERITY_ORDER: ['P0', 'P1', 'P2', 'P3'] as const,
}));

vi.mock('@/lib/format/category', () => ({
  ALL_CATEGORIES: ['security', 'ux'] as const,
  categoryLabel: (c: string) => `cat:${c}`,
}));

vi.mock('@/lib/i18n', () => ({
  t: (k: string) => k,
}));

const { FindingFilters } = await import('./finding-filters.js');

const empty = {
  severities: new Set<string>(),
  categories: new Set<string>(),
} as never;

describe('FindingFilters', () => {
  it('renders severity + category fieldsets with legends', () => {
    render(<FindingFilters value={empty} onChange={() => {}} />);
    expect(screen.getByText('findings.filter.severity')).toBeInTheDocument();
    expect(screen.getByText('findings.filter.category')).toBeInTheDocument();
  });

  it('marks active chips with aria-pressed=true', () => {
    const value = {
      severities: new Set(['P1']),
      categories: new Set(['security']),
    } as never;
    render(<FindingFilters value={value} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'P1' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'cat:security' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'P0' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('emits onChange with the toggled severity added to the set', () => {
    const onChange = vi.fn();
    render(<FindingFilters value={empty} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'P0' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(next.severities.has('P0')).toBe(true);
  });

  it('emits onChange with the toggled category removed when already present', () => {
    const onChange = vi.fn();
    const value = {
      severities: new Set(),
      categories: new Set(['security']),
    } as never;
    render(<FindingFilters value={value} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'cat:security' }));
    const next = onChange.mock.calls[0][0];
    expect(next.categories.has('security')).toBe(false);
  });
});
