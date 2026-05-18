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

const {
  FindingFilters,
  createEmptyFilters,
  parseFiltersFromSearchParams,
  serializeFiltersToSearchParams,
} = await import('./finding-filters.js');

function emptyValue() {
  return createEmptyFilters();
}

describe('FindingFilters', () => {
  it('renders severity + category fieldsets with legends', () => {
    render(<FindingFilters value={emptyValue()} onChange={() => {}} />);
    expect(screen.getByText('findings.filter.severity')).toBeInTheDocument();
    expect(screen.getByText('findings.filter.category')).toBeInTheDocument();
  });

  it('marks active chips with aria-pressed=true', () => {
    const value = {
      ...createEmptyFilters(),
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
    render(<FindingFilters value={emptyValue()} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'P0' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(next.severities.has('P0')).toBe(true);
  });

  it('emits onChange with the toggled category removed when already present', () => {
    const onChange = vi.fn();
    const value = {
      ...createEmptyFilters(),
      categories: new Set(['security']),
    } as never;
    render(<FindingFilters value={value} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'cat:security' }));
    const next = onChange.mock.calls[0][0];
    expect(next.categories.has('security')).toBe(false);
  });

  // ---- W2.C7.1 additions --------------------------------------------------

  it('exposes all 4 dimensions (severity, category, confidence, falsePositive) as multi-select chips', () => {
    // Confidence dimension renders 3 high/medium/low chips, falsePositive
    // renders 3 radio-style chips (all/show/hide). Sanity-check that each
    // chip toggles the right key without bleeding into the others.
    const onChange = vi.fn();
    render(<FindingFilters value={emptyValue()} onChange={onChange} />);

    // confidence
    fireEvent.click(
      screen.getByRole('button', { name: 'findings.filter.confidence.high' }),
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    const afterConf = onChange.mock.calls[0][0];
    expect(afterConf.confidences.has('high')).toBe(true);
    expect(afterConf.severities.size).toBe(0);
    expect(afterConf.categories.size).toBe(0);
    expect(afterConf.falsePositive).toBe('all');

    // false-positive (radio-style — picking 'hide' replaces, not toggles)
    onChange.mockClear();
    fireEvent.click(
      screen.getByRole('radio', { name: 'findings.filter.falsePositive.hide' }),
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    const afterFp = onChange.mock.calls[0][0];
    expect(afterFp.falsePositive).toBe('hide');

    // legends present so screen readers know what the chip group is for
    expect(screen.getByText('findings.filter.confidence')).toBeInTheDocument();
    expect(screen.getByText('findings.filter.falsePositive')).toBeInTheDocument();
  });

  it('round-trips filter state through URLSearchParams (parse ∘ serialize = identity)', () => {
    const original = {
      severities: new Set(['P0', 'P2']),
      categories: new Set(['security']),
      confidences: new Set(['high', 'low']),
      falsePositive: 'hide' as const,
    } as never;

    const params = serializeFiltersToSearchParams(original);
    // Schema sanity: dimensions are CSV; confidence is uppercased; fp present.
    expect(params.get('sev')).toBe('P0,P2');
    expect(params.get('cat')).toBe('security');
    expect(params.get('conf')).toBe('HIGH,LOW');
    expect(params.get('fp')).toBe('hide');

    const restored = parseFiltersFromSearchParams(params);
    expect(Array.from(restored.severities).sort()).toEqual(['P0', 'P2']);
    expect(Array.from(restored.categories)).toEqual(['security']);
    expect(Array.from(restored.confidences).sort()).toEqual(['high', 'low']);
    expect(restored.falsePositive).toBe('hide');

    // Default 'all' is OMITTED from the URL so the canonical form stays short.
    const defaults = serializeFiltersToSearchParams(emptyValue());
    expect(defaults.toString()).toBe('');
  });
});
