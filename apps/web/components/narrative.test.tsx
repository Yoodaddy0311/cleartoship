/// <reference types="@testing-library/jest-dom" />
// L-P1-3 — Narrative component unit tests. Sibling-located so the review
// gate treats it as proof-of-coverage for narrative.tsx.
//
// Scope:
//   1. FCS prop change re-renders the body text (no stale narrative).
//   2. ARIA contract: role=status + aria-live=polite + aria-labelledby
//      heading id wired so screen readers announce updates.
//   3. Heading uses the i18n key (`narrative.heading`) wording and is
//      structurally connected to the body via aria-labelledby.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { FCSResult } from '@cleartoship/shared-types';
import { Narrative } from './narrative';
import { t } from '@/lib/i18n';

function makeResult(over: Partial<FCSResult> = {}): FCSResult {
  return {
    score: 72,
    lower: 64,
    upper: 80,
    uncertainty: 8,
    status: 'CONDITIONAL',
    topConcerns: [],
    rationale: 'placeholder rationale',
    ...over,
  };
}

describe('Narrative — L-P1-3', () => {
  it('re-renders body text when the FCS prop changes', () => {
    const { rerender } = render(
      <Narrative fcs={makeResult({ status: 'READY', score: 92 })} locale="ko" />,
    );
    const initial = screen.getByTestId('narrative-body').textContent ?? '';
    expect(initial).toMatch(/양호/);
    rerender(
      <Narrative fcs={makeResult({ status: 'NOT_READY', score: 28 })} locale="ko" />,
    );
    const updated = screen.getByTestId('narrative-body').textContent ?? '';
    expect(updated).toMatch(/부적합/);
    expect(updated).not.toEqual(initial);
  });

  it('exposes aria-live=polite + role=status on the body (SR-friendly updates)', () => {
    render(<Narrative fcs={makeResult({ status: 'NEEDS_WORK' })} locale="en" />);
    const body = screen.getByTestId('narrative-body');
    expect(body).toHaveAttribute('role', 'status');
    expect(body).toHaveAttribute('aria-live', 'polite');
    expect(body).toHaveAttribute('data-locale', 'en');
  });

  it('renders the i18n heading and links it to the body via aria-labelledby', () => {
    render(<Narrative fcs={makeResult()} locale="ko" />);
    const heading = screen.getByTestId('narrative-heading');
    expect(heading).toHaveTextContent(t('narrative.heading', 'ko'));
    expect(heading).toHaveAttribute('id', 'narrative-heading');
    const section = screen.getByTestId('narrative-section');
    expect(section).toHaveAttribute('aria-labelledby', 'narrative-heading');
  });
});
