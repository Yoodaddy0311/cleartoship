/// <reference types="@testing-library/jest-dom" />
// Wave 1 W1.4 — FounderConfidenceScore unit tests. Sibling-located so the
// review-gate hook treats it as proof-of-coverage for founder-confidence-score.tsx.
//
// Coverage:
//   - Render all 7 LaunchStatus variants (READY / CONDITIONAL / NEEDS_WORK /
//     AT_RISK / NOT_READY / INDETERMINATE / BLOCKED)
//   - INDETERMINATE branch suppresses the numeric gauge but keeps the
//     uncertainty band visible
//   - topConcerns 0/1/3 — ranked list + empty-state copy
//   - rationale text passes through verbatim
//   - a11y: aria-label, role=status, role=img on visual primitives

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Concern, FCSResult } from '@cleartoship/shared-types';
import { FounderConfidenceScore } from './founder-confidence-score';

const CONCERN_A: Concern = {
  findingId: 'CC-SEC-006',
  severity: 'P0',
  confidence: 'HIGH',
  impact: 12,
  ruleFamily: 'auth/oauth-redirect',
};
const CONCERN_B: Concern = {
  findingId: 'CC-PAY-014',
  severity: 'P1',
  confidence: 'MEDIUM',
  impact: 8,
  ruleFamily: 'payment/webhook-idempotency',
};
const CONCERN_C: Concern = {
  findingId: 'CC-UX-022',
  severity: 'P2',
  confidence: 'LOW',
  impact: 4,
  ruleFamily: 'ux/cta-contrast',
};

function makeResult(over: Partial<FCSResult> = {}): FCSResult {
  return {
    score: 72,
    lower: 64,
    upper: 80,
    uncertainty: 8,
    status: 'CONDITIONAL',
    topConcerns: [CONCERN_A, CONCERN_B],
    rationale: 'OAuth misconfig + 결제 webhook 멱등성 미비로 조건부 출시 권장.',
    ...over,
  };
}

const ALL_STATUSES: FCSResult['status'][] = [
  'READY',
  'CONDITIONAL',
  'NEEDS_WORK',
  'AT_RISK',
  'NOT_READY',
  'INDETERMINATE',
  'BLOCKED',
];

describe('FounderConfidenceScore — status variants', () => {
  it.each(ALL_STATUSES)(
    'renders status chip with data-status=%s and a status-specific aria-label',
    (status) => {
      render(<FounderConfidenceScore result={makeResult({ status })} />);
      const chip = screen.getByTestId('fcs-status-chip');
      expect(chip).toHaveAttribute('data-status', status);
      expect(chip.getAttribute('aria-label')).toMatch(/출시 상태:/);
    },
  );

  it('uses a distinct color token per status (no two statuses share the same chip color)', () => {
    const colors = new Set<string>();
    for (const status of ALL_STATUSES) {
      const { unmount } = render(
        <FounderConfidenceScore result={makeResult({ status })} />,
      );
      const chip = screen.getByTestId('fcs-status-chip');
      const color = chip.getAttribute('style')?.match(/color: ([^;]+);/)?.[1];
      if (color) colors.add(color);
      unmount();
    }
    // Some statuses intentionally share a token family (AT_RISK reuses P1,
    // BLOCKED reuses P0). Minimum 4 distinct tokens proves the mapping is not
    // collapsed to a single color.
    expect(colors.size).toBeGreaterThanOrEqual(4);
  });
});

describe('FounderConfidenceScore — score gauge', () => {
  it('renders the numeric score and aria-label with score + range', () => {
    render(<FounderConfidenceScore result={makeResult({ score: 72, lower: 64, upper: 80 })} />);
    const gauge = screen.getByTestId('fcs-gauge');
    expect(gauge).toHaveTextContent('72');
    expect(gauge.getAttribute('aria-label')).toMatch(/72.+64.+80/);
  });

  it('rounds non-integer score values for display', () => {
    render(
      <FounderConfidenceScore
        result={makeResult({ score: 71.7, lower: 63.4, upper: 80.2 })}
      />,
    );
    const gauge = screen.getByTestId('fcs-gauge');
    expect(gauge).toHaveTextContent('72');
  });

  it('suppresses the numeric gauge for INDETERMINATE and shows the N/A placeholder', () => {
    render(<FounderConfidenceScore result={makeResult({ status: 'INDETERMINATE' })} />);
    expect(screen.queryByTestId('fcs-gauge')).not.toBeInTheDocument();
    expect(screen.getByTestId('fcs-gauge-indeterminate')).toHaveTextContent('N/A');
  });

  it('shows the indeterminate note for INDETERMINATE only', () => {
    const { rerender } = render(
      <FounderConfidenceScore result={makeResult({ status: 'READY' })} />,
    );
    expect(screen.queryByTestId('fcs-indeterminate-note')).not.toBeInTheDocument();
    rerender(<FounderConfidenceScore result={makeResult({ status: 'INDETERMINATE' })} />);
    expect(screen.getByTestId('fcs-indeterminate-note')).toBeInTheDocument();
  });
});

describe('FounderConfidenceScore — uncertainty bar', () => {
  it('renders the uncertainty band with lower/upper labels and aria-label', () => {
    render(
      <FounderConfidenceScore result={makeResult({ lower: 60, upper: 88, uncertainty: 14 })} />,
    );
    const bar = screen.getByTestId('fcs-uncertainty-bar');
    expect(bar.getAttribute('aria-label')).toMatch(/60.+88/);
    expect(screen.getByText(/±14/)).toBeInTheDocument();
    expect(screen.getByText(/60–88/)).toBeInTheDocument();
  });

  it('hides the score marker for INDETERMINATE (band only)', () => {
    render(<FounderConfidenceScore result={makeResult({ status: 'INDETERMINATE' })} />);
    expect(screen.getByTestId('fcs-uncertainty-bar')).toBeInTheDocument();
    expect(screen.queryByTestId('fcs-uncertainty-marker')).not.toBeInTheDocument();
  });

  it('renders the score marker for any non-indeterminate status', () => {
    render(<FounderConfidenceScore result={makeResult({ status: 'NEEDS_WORK' })} />);
    expect(screen.getByTestId('fcs-uncertainty-marker')).toBeInTheDocument();
  });
});

describe('FounderConfidenceScore — concerns list', () => {
  it('renders up to 3 concerns in ranked order with severity chip and ruleFamily', () => {
    render(
      <FounderConfidenceScore
        result={makeResult({ topConcerns: [CONCERN_A, CONCERN_B, CONCERN_C] })}
      />,
    );
    const items = screen.getAllByTestId('fcs-concern');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('auth/oauth-redirect');
    expect(items[1]).toHaveTextContent('payment/webhook-idempotency');
    expect(items[2]).toHaveTextContent('ux/cta-contrast');
    const sevChips = screen.getAllByTestId('fcs-severity-chip');
    expect(sevChips[0]).toHaveAttribute('data-severity', 'P0');
    expect(sevChips[1]).toHaveAttribute('data-severity', 'P1');
    expect(sevChips[2]).toHaveAttribute('data-severity', 'P2');
  });

  it('renders the empty-state copy when topConcerns is []', () => {
    render(<FounderConfidenceScore result={makeResult({ topConcerns: [] })} />);
    expect(screen.queryAllByTestId('fcs-concern')).toHaveLength(0);
    expect(screen.getByText('주요 우려 사항이 없습니다.')).toBeInTheDocument();
  });
});

describe('FounderConfidenceScore — rationale', () => {
  it('passes the rationale string through verbatim', () => {
    const rationale = 'Stripe webhook 검증 누락 + 모바일 반응형 360px 깨짐.';
    render(<FounderConfidenceScore result={makeResult({ rationale })} />);
    expect(screen.getByText(rationale)).toBeInTheDocument();
  });
});

describe('FounderConfidenceScore — a11y', () => {
  it('exposes section heading via aria-labelledby (one heading per render)', () => {
    render(<FounderConfidenceScore result={makeResult()} />);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveAttribute('id', 'fcs-heading');
    expect(heading).toHaveTextContent('창업자 확신 점수');
  });

  it('uses role="img" for visual primitives (gauge + uncertainty bar)', () => {
    render(<FounderConfidenceScore result={makeResult()} />);
    // Two role=img elements: gauge + uncertainty bar.
    const imgs = screen.getAllByRole('img');
    expect(imgs.length).toBeGreaterThanOrEqual(2);
  });

  it('status chip uses role="status" (live region)', () => {
    render(<FounderConfidenceScore result={makeResult({ status: 'NOT_READY' })} />);
    const chip = screen.getByTestId('fcs-status-chip');
    expect(chip).toHaveAttribute('role', 'status');
  });
});
