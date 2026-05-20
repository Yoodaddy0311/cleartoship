import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StrengthsPanel } from './strengths-panel';

// Fixtures: severity counts shaped to isolate which strength card a test
// expects. Both P0===0 AND P1===0 each independently emit a strength card,
// so a test that wants ONLY the P1-zero card rendered must have P0 != 0,
// and vice versa. The earlier fixture set conflated these and tripped the
// "renders nothing" + "renders only P1-zero" tests.
const SEVERITY_ALL_ZERO = { P0: 0, P1: 0, P2: 0, P3: 0 };
const SEVERITY_BOTH_NONZERO = { P0: 2, P1: 1, P2: 5, P3: 8 };
const SEVERITY_P0_ZERO_ONLY = { P0: 0, P1: 1, P2: 5, P3: 8 };
const SEVERITY_P1_ZERO_ONLY = { P0: 2, P1: 0, P2: 5, P3: 8 };

// Match the `Record<AuditCategory, number|null>` shape returned by
// `adaptCategoryScoresNullable`. Tests only set the keys they care about
// — unset keys default to null at the test boundary.
function categoryScores(
  overrides: Record<string, number | null>
): Parameters<typeof StrengthsPanel>[0]['categoryScores'] {
  return {
    PRODUCT_INTENT: null,
    REQUIREMENT_COVERAGE: null,
    FEATURE_GRAPH: null,
    FUNCTIONAL_FLOW: null,
    UX_UI: null,
    FRONTEND_CODE: null,
    BACKEND_API: null,
    DATA_MODEL: null,
    SECURITY_PRIVACY: null,
    LAUNCH_READINESS: null,
    BUSINESS_READINESS: null,
    ...overrides,
  };
}

describe('StrengthsPanel', () => {
  it('renders nothing when severity has open issues AND no high-scoring categories', () => {
    const { container } = render(
      <StrengthsPanel
        severityCounts={SEVERITY_BOTH_NONZERO}
        categoryScores={categoryScores({ FRONTEND_CODE: 65 })}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the P0-zero strength when severityCounts.P0 === 0', () => {
    render(
      <StrengthsPanel
        severityCounts={SEVERITY_P0_ZERO_ONLY}
        categoryScores={categoryScores({ FRONTEND_CODE: 65 })}
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
        severityCounts={SEVERITY_P1_ZERO_ONLY}
        categoryScores={categoryScores({ FRONTEND_CODE: 65 })}
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
        severityCounts={SEVERITY_BOTH_NONZERO}
        categoryScores={categoryScores({
          SECURITY_PRIVACY: 90,
          FRONTEND_CODE: 65,
        })}
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
        categoryScores={categoryScores({
          SECURITY_PRIVACY: 90,
          FRONTEND_CODE: 65,
        })}
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
