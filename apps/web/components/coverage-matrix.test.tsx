/// <reference types="@testing-library/jest-dom" />
// W2.C8.1 — CoverageMatrix UI tests (Sprint 4 §2.8 / Batch B). Five cases
// per PRD:
//   1. sticky header className present on row + column headers (no scroll
//      offset measurement — that's an e2e/visual concern, not a unit test).
//   2. scroll hint renders inside the scroll container.
//   3. 4 badge variants render correctly (covered/partial/missing/na) — one
//      seeded entry per variant; assert role + label + data-variant.
//   4. empty matrix shows the i18n empty-state copy (no table).
//   5. large 10×10 matrix renders without throwing and keeps the sticky
//      scaffolding intact.

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { CoverageMatrixEntry } from '@cleartoship/shared-types';
import { CoverageMatrix } from './coverage-matrix';
import { t } from '@/lib/i18n';

function entry(over: Partial<CoverageMatrixEntry> = {}): CoverageMatrixEntry {
  return {
    claim: 'OAuth 로그인 흐름을 지원해야 한다',
    status: 'fulfilled',
    evidence: [{ type: 'file', path: 'apps/web/lib/auth/oauth.ts' }],
    recommendation: undefined,
    confidence: 'HIGH',
    ...over,
  };
}

describe('CoverageMatrix — W2.C8.1', () => {
  it('renders sticky header className on both column and row headers', () => {
    render(
      <CoverageMatrix
        matrix={[
          entry({ claim: 'A', status: 'fulfilled' }),
          entry({ claim: 'B', status: 'partial', recommendation: 'Stripe webhook 검증 추가' }),
        ]}
      />,
    );

    // Column headers — all 4 must carry `sticky top-0`.
    const colHeaders = [
      'coverage-col-header-claim',
      'coverage-col-header-status',
      'coverage-col-header-evidence',
      'coverage-col-header-recommendation',
    ];
    for (const id of colHeaders) {
      const el = screen.getByTestId(id);
      expect(el.className).toMatch(/\bsticky\b/);
      expect(el.className).toMatch(/\btop-0\b/);
      expect(el.getAttribute('scope')).toBe('col');
    }

    // Row headers — left-sticky for horizontal scroll.
    const rowHeaders = screen.getAllByTestId('coverage-row-header');
    expect(rowHeaders.length).toBe(2);
    for (const rh of rowHeaders) {
      expect(rh.className).toMatch(/\bsticky\b/);
      expect(rh.className).toMatch(/\bleft-0\b/);
      expect(rh.getAttribute('scope')).toBe('row');
    }
  });

  it('renders a scroll hint inside the scroll container (responsive affordance)', () => {
    render(<CoverageMatrix matrix={[entry()]} />);
    const container = screen.getByTestId('coverage-scroll-container');
    // Container itself must allow horizontal scroll for the hint to make sense.
    expect(container.className).toMatch(/overflow-x-auto/);

    const hint = screen.getByTestId('coverage-scroll-hint');
    expect(container.contains(hint)).toBe(true);
    // Hint label is sr-only — the visual element itself is aria-hidden.
    expect(hint.getAttribute('aria-hidden')).toBe('true');
    expect(within(hint).getByText(t('coverage.scrollHint'))).toBeInTheDocument();
  });

  it('renders the 4 badge variants — covered, partial, missing, na', () => {
    const matrix: CoverageMatrixEntry[] = [
      entry({ claim: 'covered row', status: 'fulfilled', confidence: 'HIGH' }),
      entry({
        claim: 'partial row',
        status: 'partial',
        confidence: 'MEDIUM',
        recommendation: 'webhook idempotency 추가',
        evidence: [{ type: 'finding', findingId: 'CC-PAY-014' }],
      }),
      entry({
        claim: 'missing row',
        status: 'unclear',
        confidence: 'HIGH',
        recommendation: '구현 또는 PRD 수정',
        evidence: [],
      }),
      entry({
        claim: 'na row',
        status: 'unclear',
        confidence: 'LOW',
        recommendation: '구현 또는 PRD 수정',
        evidence: [],
      }),
    ];
    render(<CoverageMatrix matrix={matrix} />);

    const badges = screen.getAllByTestId('coverage-badge');
    expect(badges).toHaveLength(4);

    const variantOrder = badges.map((b) => b.getAttribute('data-variant'));
    expect(variantOrder).toEqual(['covered', 'partial', 'missing', 'na']);

    // Each badge carries the i18n label as both visible text and aria-label,
    // and uses role="status" so AT announces it as a state indicator.
    const expected: Array<['covered' | 'partial' | 'missing' | 'na', string]> = [
      ['covered', t('coverage.status.covered')],
      ['partial', t('coverage.status.partial')],
      ['missing', t('coverage.status.missing')],
      ['na', t('coverage.status.na')],
    ];
    for (const [variant, label] of expected) {
      const badge = badges.find((b) => b.getAttribute('data-variant') === variant)!;
      expect(badge).toBeDefined();
      expect(badge.getAttribute('role')).toBe('status');
      expect(badge.getAttribute('aria-label')).toBe(label);
      expect(badge.textContent).toContain(label);
    }
  });

  it('renders the empty-state copy when matrix is empty (no table)', () => {
    render(<CoverageMatrix matrix={[]} />);
    const empty = screen.getByTestId('coverage-empty');
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).toBe(t('coverage.empty'));
    // No table should be rendered at all.
    expect(screen.queryByTestId('coverage-scroll-container')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('coverage-row')).toHaveLength(0);
  });

  it('renders a 10-row matrix without breaking and keeps headers sticky', () => {
    const rows: CoverageMatrixEntry[] = Array.from({ length: 10 }, (_, i) =>
      entry({
        claim: `claim ${i + 1} — long description that exceeds the column width to exercise the truncate path`,
        status: i % 3 === 0 ? 'fulfilled' : i % 3 === 1 ? 'partial' : 'unclear',
        confidence: i % 4 === 0 ? 'LOW' : i % 4 === 1 ? 'MEDIUM' : 'HIGH',
        recommendation: i % 3 === 0 ? undefined : `fix ${i + 1}`,
        evidence:
          i % 2 === 0
            ? [{ type: 'file', path: `src/feature-${i}.ts` }]
            : [{ type: 'finding', findingId: `CC-X-${i}` }],
      }),
    );

    render(<CoverageMatrix matrix={rows} />);
    expect(screen.getAllByTestId('coverage-row')).toHaveLength(10);
    // Sticky scaffolding intact for the large render.
    expect(screen.getByTestId('coverage-col-header-claim').className).toMatch(
      /\bsticky\b/,
    );
    expect(screen.getByTestId('coverage-scroll-hint')).toBeInTheDocument();
  });
});
