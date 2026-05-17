// Behavioural test for the Layer-2 categories page.
//
// Why these specific assertions:
//   - "ready" state must render the breadcrumb + tab nav so users can always
//     escape back to the dashboard (a11y back-button requirement).
//   - the accordion must default closed (aria-expanded="false") and toggle on
//     click — otherwise the page renders all 10 panels at once, defeating the
//     progressive-disclosure goal.
//   - "N/A" categories (score===null) must NOT render a ScoreGauge — see
//     dashboard/category-grid.tsx N/A tile precedent.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'run-1' }),
}));

vi.mock('@/lib/api/audit-runs', () => ({
  getReport: vi.fn(),
  listFindings: vi.fn(),
}));

vi.mock('@/lib/api/adapters', () => ({
  adaptCategoryScoresNullable: (scores: Array<{ category: string; score: number }>) => {
    const out: Record<string, number | null> = {};
    for (const s of scores) out[s.category] = s.score;
    return out;
  },
  adaptFinding: (f: {
    id: string;
    title: string;
    category: string;
    severity: string;
  }) => ({
    id: f.id,
    title: f.title,
    summary: 'summary',
    category: f.category,
    severity: f.severity,
    evidences: [],
  }),
}));

vi.mock('@cleartoship/ui', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@cleartoship/ui');
  return {
    ...actual,
    ScoreGauge: (props: { score: number }) => (
      <div data-testid="score-gauge" data-score={props.score} />
    ),
  };
});

describe('CategoriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports a default React component function', async () => {
    const mod = await import('./page');
    expect(typeof mod.default).toBe('function');
  });

  it('renders tab nav while loading (initial pending state)', async () => {
    const { getReport, listFindings } = await import('@/lib/api/audit-runs');
    vi.mocked(getReport).mockImplementation(() => new Promise(() => {}));
    vi.mocked(listFindings).mockImplementation(() => new Promise(() => {}));

    const { default: CategoriesPage } = await import('./page');
    render(<CategoriesPage />);

    expect(
      screen.getByRole('navigation', { name: '감사 결과 탭' })
    ).toBeInTheDocument();
  });

  it('fetches report + findings with the expected limit on mount', async () => {
    const { getReport, listFindings } = await import('@/lib/api/audit-runs');
    vi.mocked(getReport).mockResolvedValue({
      id: 'main',
      auditRunId: 'run-1',
      readinessScore: 80,
      launchStatus: 'READY',
      categoryScores: [],
      severityCounts: { P0: 0, P1: 0, P2: 0, P3: 0 },
      executiveSummary: '',
      markdown: '',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    } as never);
    vi.mocked(listFindings).mockResolvedValue({
      findings: [],
      nextCursor: null,
    } as never);

    const { default: CategoriesPage } = await import('./page');
    render(<CategoriesPage />);

    await waitFor(() => {
      expect(vi.mocked(listFindings)).toHaveBeenCalledWith('run-1', {
        limit: 500,
      });
    });
  });

  it('renders 10 accordion buttons (one per audit category), all initially collapsed', async () => {
    const { getReport, listFindings } = await import('@/lib/api/audit-runs');
    vi.mocked(getReport).mockResolvedValue({
      id: 'main',
      auditRunId: 'run-1',
      readinessScore: 75,
      launchStatus: 'CONDITIONAL',
      categoryScores: [
        { category: 'PRODUCT_INTENT', score: 80, label: '', summary: null },
      ],
      severityCounts: { P0: 0, P1: 1, P2: 0, P3: 0 },
      executiveSummary: '',
      markdown: '',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    } as never);
    vi.mocked(listFindings).mockResolvedValue({
      findings: [],
      nextCursor: null,
    } as never);

    const { default: CategoriesPage } = await import('./page');
    render(<CategoriesPage />);

    await waitFor(() => {
      const expandables = screen.getAllByRole('button', { expanded: false });
      // 10 audit categories. Other buttons on the page (none expected here)
      // would also match, so we assert at-least-10 instead of exact equality.
      expect(expandables.length).toBeGreaterThanOrEqual(10);
    });
  });

  it('expands an accordion panel on click (aria-expanded toggles to true)', async () => {
    const { getReport, listFindings } = await import('@/lib/api/audit-runs');
    vi.mocked(getReport).mockResolvedValue({
      id: 'main',
      auditRunId: 'run-1',
      readinessScore: 50,
      launchStatus: 'NEEDS_WORK',
      categoryScores: [
        { category: 'SECURITY_PRIVACY', score: 40, label: '', summary: null },
      ],
      severityCounts: { P0: 1, P1: 0, P2: 0, P3: 0 },
      executiveSummary: '',
      markdown: '',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    } as never);
    vi.mocked(listFindings).mockResolvedValue({
      findings: [
        {
          id: 'f1',
          title: 'API key leaked in client bundle',
          category: 'SECURITY_PRIVACY',
          severity: 'P0',
        },
      ],
      nextCursor: null,
    } as never);

    const { default: CategoriesPage } = await import('./page');
    render(<CategoriesPage />);

    const securityHeading = await screen.findByText('보안/개인정보');
    const accordionButton = securityHeading.closest('button');
    expect(accordionButton).not.toBeNull();
    expect(accordionButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(accordionButton!);
    expect(accordionButton).toHaveAttribute('aria-expanded', 'true');

    // After expansion, the panel reveals a link to the finding detail page.
    const panelId = accordionButton!.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    const panel = document.getElementById(panelId!) as HTMLElement;
    expect(panel).not.toBeNull();
    const link = within(panel).getByRole('link', {
      name: 'API key leaked in client bundle',
    });
    expect(link).toHaveAttribute('href', '/audits/run-1/findings/f1');
  });

  it('renders "N/A" placeholder for categories with null score (no ScoreGauge)', async () => {
    const { getReport, listFindings } = await import('@/lib/api/audit-runs');
    vi.mocked(getReport).mockResolvedValue({
      id: 'main',
      auditRunId: 'run-1',
      readinessScore: 0,
      launchStatus: 'INDETERMINATE',
      // No score for PRODUCT_INTENT — adapter leaves it undefined; render path
      // treats `null/undefined` the same.
      categoryScores: [],
      severityCounts: { P0: 0, P1: 0, P2: 0, P3: 0 },
      executiveSummary: '',
      markdown: '',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    } as never);
    vi.mocked(listFindings).mockResolvedValue({
      findings: [],
      nextCursor: null,
    } as never);

    const { default: CategoriesPage } = await import('./page');
    render(<CategoriesPage />);

    await waitFor(() => {
      // 10 categories all N/A → at least 10 N/A markers.
      const naMarkers = screen.getAllByText('N/A');
      expect(naMarkers.length).toBeGreaterThanOrEqual(10);
    });
    // No ScoreGauge stubs should be rendered when every category is N/A.
    expect(screen.queryAllByTestId('score-gauge')).toHaveLength(0);
  });

  it('renders breadcrumb back-link to the dashboard', async () => {
    const { getReport, listFindings } = await import('@/lib/api/audit-runs');
    vi.mocked(getReport).mockResolvedValue({
      id: 'main',
      auditRunId: 'run-1',
      readinessScore: 80,
      launchStatus: 'READY',
      categoryScores: [],
      severityCounts: { P0: 0, P1: 0, P2: 0, P3: 0 },
      executiveSummary: '',
      markdown: '',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    } as never);
    vi.mocked(listFindings).mockResolvedValue({
      findings: [],
      nextCursor: null,
    } as never);

    const { default: CategoriesPage } = await import('./page');
    render(<CategoriesPage />);

    const breadcrumb = await screen.findByRole('navigation', { name: '경로' });
    const dashboardLink = within(breadcrumb).getByRole('link', { name: '대시보드' });
    expect(dashboardLink).toHaveAttribute('href', '/audits/run-1/dashboard');
  });

  it('renders error state when getReport fails', async () => {
    const { getReport, listFindings } = await import('@/lib/api/audit-runs');
    vi.mocked(getReport).mockRejectedValue(new Error('boom'));
    vi.mocked(listFindings).mockResolvedValue({
      findings: [],
      nextCursor: null,
    } as never);

    const { default: CategoriesPage } = await import('./page');
    render(<CategoriesPage />);

    await waitFor(() => {
      expect(screen.getByText(/오류가 발생/)).toBeInTheDocument();
    });
  });
});
