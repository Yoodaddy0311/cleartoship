// ScoreOverview tests — sibling-located on purpose.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@cleartoship/ui', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  CardBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ScoreRing: ({ score, ariaLabel }: { score: number; ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel}>{score}</div>
  ),
}));

vi.mock('@/components/common/launch-status-chip', () => ({
  LaunchStatusChip: ({ status }: { status: string }) => <span data-testid="chip">{status}</span>,
}));

vi.mock('@/lib/format/status', () => ({
  launchStatusLabel: (s: string) => `label:${s}`,
}));

vi.mock('@/lib/i18n', () => ({
  t: (k: string) => k,
}));

const { ScoreOverview } = await import('./score-overview.js');

describe('ScoreOverview', () => {
  it('renders the score ring with an a11y label', () => {
    render(<ScoreOverview score={82} launchStatus="ready" summary="Ready to ship" />);
    expect(screen.getByRole('img', { name: '출시 준비도 82점' })).toBeInTheDocument();
  });

  it('shows the summary copy and launch status chip', () => {
    render(<ScoreOverview score={50} launchStatus="stop" summary="Risky" />);
    expect(screen.getByText('Risky')).toBeInTheDocument();
    expect(screen.getByTestId('chip')).toHaveTextContent('stop');
  });

  it('exposes a screen-reader-only status label', () => {
    render(<ScoreOverview score={70} launchStatus="ready" summary="ok" />);
    expect(screen.getByText('상태: label:ready')).toBeInTheDocument();
  });

  // INDETERMINATE: when the coverage signal is too low to score the run, the
  // overview must NOT present a numeric score as if it were a verdict. It
  // surfaces an inline banner and replaces the score ring with an N/A
  // placeholder.
  it('renders the "분석 표면 부족" banner for indeterminate launch status', () => {
    render(
      <ScoreOverview
        score={0}
        launchStatus="indeterminate"
        summary="placeholder summary"
      />
    );
    const banner = screen.getByTestId('score-indeterminate-banner');
    expect(banner).toHaveTextContent(
      /분석 표면 부족 — 신뢰할 수 있는 점수 산정 어려움/
    );
  });

  it('replaces the ScoreRing with an N/A placeholder when indeterminate', () => {
    render(
      <ScoreOverview
        score={0}
        launchStatus="indeterminate"
        summary="placeholder summary"
      />
    );
    expect(screen.getByTestId('score-indeterminate-ring')).toHaveTextContent('N/A');
    // The numeric ScoreRing must not also render — otherwise a 0점 verdict
    // would leak through.
    expect(
      screen.queryByRole('img', { name: /출시 준비도 \d+점/ })
    ).not.toBeInTheDocument();
  });

  it('does NOT render the banner for any normal launch status', () => {
    render(<ScoreOverview score={50} launchStatus="needs_work" summary="ok" />);
    expect(screen.queryByTestId('score-indeterminate-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('score-indeterminate-ring')).not.toBeInTheDocument();
  });
});
