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
});
