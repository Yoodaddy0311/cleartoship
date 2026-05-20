import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StrengthsPanel } from './strengths-panel';

const SEVERITY_ALL_ZERO = { P0: 0, P1: 0, P2: 0, P3: 0 };
const SEVERITY_P0_NONZERO = { P0: 2, P1: 0, P2: 5, P3: 8 };
const SEVERITY_P1_NONZERO = { P0: 0, P1: 1, P2: 5, P3: 8 };

const CAT_HIGH = {
  category: 'SECURITY_PRIVACY' as const,
  score: 90,
  label: '보안',
  summary: null,
};
const CAT_MID = {
  category: 'FRONTEND_CODE' as const,
  score: 65,
  label: '프론트엔드',
  summary: null,
};
const CAT_NULL = {
  category: 'UX_UI' as const,
  score: null,
  label: 'UX',
  summary: null,
};

describe('StrengthsPanel', () => {
  it('renders nothing when severity has open issues AND no high-scoring categories', () => {
    const { container } = render(
      <StrengthsPanel
        severityCounts={SEVERITY_P0_NONZERO}
        categoryScores={[CAT_MID, CAT_NULL]}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the P0-zero strength when severityCounts.P0 === 0', () => {
    render(
      <StrengthsPanel
        severityCounts={{ P0: 0, P1: 3, P2: 5, P3: 8 }}
        categoryScores={[CAT_MID]}
      />
    );
    expect(
      screen.getByTestId('strength-card-severity-p0-zero')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('strength-card-severity-p1-zero')
    ).not.toBeInTheDocument();
  });

  it('renders the P1-zero strength when severityCounts.P1 === 0', () => {
    render(
      <StrengthsPanel
        severityCounts={SEVERITY_P1_NONZERO}
        categoryScores={[CAT_MID]}
      />
    );
    // P0 has findings here, so the only severity strength is P1=0.
    expect(
      screen.queryByTestId('strength-card-severity-p0-zero')
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('strength-card-severity-p1-zero')
    ).toBeInTheDocument();
  });

  it('renders category strengths only when score >= 80 and score is not null', () => {
    render(
      <StrengthsPanel
        severityCounts={SEVERITY_P0_NONZERO}
        categoryScores={[CAT_HIGH, CAT_MID, CAT_NULL]}
      />
    );
    expect(
      screen.getByTestId('strength-card-category-SECURITY_PRIVACY')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('strength-card-category-FRONTEND_CODE')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('strength-card-category-UX_UI')
    ).not.toBeInTheDocument();
  });

  it('renders multiple strengths together (severity + category)', () => {
    render(
      <StrengthsPanel
        severityCounts={SEVERITY_ALL_ZERO}
        categoryScores={[CAT_HIGH, CAT_MID]}
      />
    );
    expect(screen.getByTestId('strengths-panel')).toBeInTheDocument();
    expect(
      screen.getByTestId('strength-card-severity-p0-zero')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('strength-card-severity-p1-zero')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('strength-card-category-SECURITY_PRIVACY')
    ).toBeInTheDocument();
  });
});
