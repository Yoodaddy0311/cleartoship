// CategoryGrid tests — W2.C6.1 (2×6 enhance).
//
// Covers four PRD-named scenarios:
//  1. 12 cells render (11 categories + 1 placeholder).
//  2. weight=0 → tile dimmed (opacity-50) + cursor-not-allowed + tooltip.
//  3. weight=0 tooltip exposed via `title` attribute on the tile wrapper.
//  4. Click-to-filter callback + aria-pressed toggle (single-select).
//
// Sibling-located on purpose to mirror score-overview.test.tsx.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ALL_CATEGORIES, type AuditCategory } from '@/lib/format/category';

vi.mock('@cleartoship/ui', () => ({
  ScoreGauge: ({
    label,
    score,
    weight,
  }: {
    label: string;
    score: number;
    weight?: number;
  }) => (
    <div data-testid="score-gauge" data-label={label} data-score={score}>
      {label}: {score}
      {typeof weight === 'number' ? ` (w=${weight})` : ''}
    </div>
  ),
}));

vi.mock('@/components/common/launch-status-chip', () => ({
  LaunchStatusChip: ({ status }: { status: string }) => (
    <span data-testid="chip">{status}</span>
  ),
}));

// Translation stub returns the key itself so the test can assert on stable
// strings without coupling to KR/EN copy.
vi.mock('@/lib/i18n', () => ({
  t: (k: string) => k,
}));

const { CategoryGrid } = await import('./category-grid.js');

function fullScores(value: number | null = 70): Record<AuditCategory, number | null> {
  const out = {} as Record<AuditCategory, number | null>;
  for (const c of ALL_CATEGORIES) out[c] = value;
  return out;
}

describe('CategoryGrid (W2.C6.1 — 2×6 enhance)', () => {
  it('renders 12 cells total: 11 category tiles + 1 placeholder cell', () => {
    render(<CategoryGrid scores={fullScores(70)} />);

    // 11 category cells — one data-testid per AuditCategory.
    for (const c of ALL_CATEGORIES) {
      expect(screen.getByTestId(`category-cell-${c}`)).toBeInTheDocument();
    }
    expect(ALL_CATEGORIES).toHaveLength(11);

    // 12th = explicit placeholder cell. Together = 12 cells in the 2×6 grid.
    expect(screen.getByTestId('category-placeholder-cell')).toBeInTheDocument();
  });

  it('dims a tile when its weight is 0 and marks it cursor-not-allowed', () => {
    const target: AuditCategory = 'PRODUCT_INTENT';
    render(
      <CategoryGrid scores={fullScores(75)} weights={{ [target]: 0 }} />,
    );

    const cell = screen.getByTestId(`category-cell-${target}`);
    expect(cell.className).toContain('opacity-50');
    expect(cell.className).toContain('cursor-not-allowed');
    expect(cell.getAttribute('data-zero-weight')).toBe('true');

    // Sibling tile (non-zero/unspecified weight) must NOT be dimmed.
    const sibling = screen.getByTestId('category-cell-UX_UI');
    expect(sibling.className).not.toContain('opacity-50');
  });

  it('exposes the weight=0 tooltip via the title attribute on the dimmed tile', () => {
    const target: AuditCategory = 'BUSINESS_READINESS';
    render(
      <CategoryGrid scores={fullScores(40)} weights={{ [target]: 0 }} />,
    );

    const cell = screen.getByTestId(`category-cell-${target}`);
    // Stubbed t() returns the key itself → assert on the key.
    expect(cell.getAttribute('title')).toBe(
      'category.grid.weight.zero.tooltip',
    );
  });

  it('fires onCategoryClick and toggles aria-pressed on the clicked tile', () => {
    const onClick = vi.fn();
    const target: AuditCategory = 'SECURITY_PRIVACY';
    render(
      <CategoryGrid scores={fullScores(60)} onCategoryClick={onClick} />,
    );

    const cell = screen.getByTestId(`category-cell-${target}`);

    // Clickable cells render as <button> with aria-pressed reflecting state.
    expect(cell.tagName).toBe('BUTTON');
    expect(cell.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(cell);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(target);
    expect(cell.getAttribute('aria-pressed')).toBe('true');

    // Clicking again toggles selection off (single-select filter behaviour).
    fireEvent.click(cell);
    expect(cell.getAttribute('aria-pressed')).toBe('false');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('renders non-clickable static tiles when onCategoryClick is omitted', () => {
    render(<CategoryGrid scores={fullScores(70)} />);
    const cell = screen.getByTestId('category-cell-UX_UI');
    expect(cell.tagName).toBe('DIV');
    expect(cell.getAttribute('aria-pressed')).toBeNull();
  });

  it('does NOT invoke onCategoryClick for a weight=0 tile (rendered non-interactive)', () => {
    const onClick = vi.fn();
    const target: AuditCategory = 'DATA_MODEL';
    render(
      <CategoryGrid
        scores={fullScores(80)}
        weights={{ [target]: 0 }}
        onCategoryClick={onClick}
      />,
    );

    const cell = screen.getByTestId(`category-cell-${target}`);
    // Weight=0 must render as static <div>, not a button — so a stray click
    // can never invoke the filter callback for an excluded category.
    expect(cell.tagName).toBe('DIV');
    fireEvent.click(cell);
    expect(onClick).not.toHaveBeenCalled();
  });
});
