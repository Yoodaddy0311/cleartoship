// Behavioural test for the dashboard page.
//
// Verifies the loading / ready / error branches by mocking the data-fetching
// API surface and rendering the page through @testing-library/react.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'run-1' }),
}));

// Mock the data-fetching API surface used by the dashboard page.
vi.mock('@/lib/api/audit-runs', () => ({
  getReport: vi.fn(),
  listFindings: vi.fn(),
  getAuditRun: vi.fn(),
}));

// Stub the adapters so we never need to provide perfectly-shaped API data.
vi.mock('@/lib/api/adapters', () => ({
  adaptCategoryScores: vi.fn(() => ({})),
  adaptCategoryScoresNullable: vi.fn(() => ({})),
  adaptFinding: vi.fn((f: { id: string }) => ({
    id: f.id,
    title: 'Stub finding',
    summary: 'Stub summary',
    category: 'PRODUCT_INTENT',
    severity: 'P2',
  })),
  adaptLaunchStatus: vi.fn(() => 'ready'),
}));

// Stub the heavy presentation components — they're tested separately.
vi.mock('@/components/dashboard/score-overview', () => ({
  ScoreOverview: () => <div data-stub="score-overview" />,
}));
vi.mock('@/components/dashboard/severity-counts', () => ({
  SeverityCounts: () => <div data-stub="severity-counts" />,
}));
vi.mock('@/components/dashboard/category-grid', () => ({
  CategoryGrid: () => <div data-stub="category-grid" />,
}));

// The dashboard idle-prefetches the GraphCanvas chunk; stub the hook so we
// don't pull reactflow into the dashboard test graph.
vi.mock('@/components/feature-graph/use-prefetch-graph-canvas', () => ({
  usePrefetchGraphCanvas: vi.fn(),
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports a default React component function', async () => {
    const mod = await import('./page');
    expect(typeof mod.default).toBe('function');
  });

  it('shows loading state initially (mocks return never-resolving Promise)', async () => {
    const { getReport, listFindings, getAuditRun } = await import(
      '@/lib/api/audit-runs'
    );
    vi.mocked(getReport).mockImplementation(() => new Promise(() => {}));
    vi.mocked(listFindings).mockImplementation(() => new Promise(() => {}));
    vi.mocked(getAuditRun).mockImplementation(() => new Promise(() => {}));

    const { default: DashboardPage } = await import('./page');
    render(<DashboardPage />);

    expect(
      screen.getByRole('navigation', { name: '감사 결과 탭' })
    ).toBeInTheDocument();
  });

  it('renders ready state when data resolves', async () => {
    const { getReport, listFindings, getAuditRun } = await import(
      '@/lib/api/audit-runs'
    );
    vi.mocked(getReport).mockResolvedValue({
      readinessScore: 80,
      launchStatus: 'READY',
      executiveSummary: 'ok',
      categoryScores: [],
      severityCounts: { P0: 0, P1: 0, P2: 0, P3: 0 },
    } as never);
    vi.mocked(listFindings).mockResolvedValue({
      findings: [],
      nextCursor: null,
    } as never);
    vi.mocked(getAuditRun).mockResolvedValue({
      id: 'run-1',
      partialResultTools: [],
    } as never);

    const { default: DashboardPage } = await import('./page');
    render(<DashboardPage />);

    await waitFor(() => {
      expect(vi.mocked(getReport)).toHaveBeenCalledWith('run-1');
    });
    expect(vi.mocked(listFindings)).toHaveBeenCalledWith('run-1', { limit: 5 });
    expect(vi.mocked(getAuditRun)).toHaveBeenCalledWith('run-1');
  });

  it('renders error state when fetch fails', async () => {
    const { getReport, listFindings, getAuditRun } = await import(
      '@/lib/api/audit-runs'
    );
    vi.mocked(getReport).mockRejectedValue(new Error('boom'));
    vi.mocked(listFindings).mockRejectedValue(new Error('boom'));
    vi.mocked(getAuditRun).mockRejectedValue(new Error('boom'));

    const { default: DashboardPage } = await import('./page');
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/오류가 발생/)).toBeInTheDocument();
    });
  });

  it('triggers idle prefetch of the GraphCanvas chunk on mount', async () => {
    const { getReport, listFindings, getAuditRun } = await import(
      '@/lib/api/audit-runs'
    );
    vi.mocked(getReport).mockImplementation(() => new Promise(() => {}));
    vi.mocked(listFindings).mockImplementation(() => new Promise(() => {}));
    vi.mocked(getAuditRun).mockImplementation(() => new Promise(() => {}));

    const { usePrefetchGraphCanvas } = await import(
      '@/components/feature-graph/use-prefetch-graph-canvas'
    );
    const { default: DashboardPage } = await import('./page');
    render(<DashboardPage />);

    expect(vi.mocked(usePrefetchGraphCanvas)).toHaveBeenCalled();
  });

  // T1.1d: BLOCKED short-circuit. When the worker calls `markRunBlocked` (e.g.
  // REPO_TOO_LARGE), no report doc exists — dashboard must render the verdict
  // chip + abortReason WITHOUT calling getReport (which would 404 and crash
  // the whole Promise.all).
  it('renders BLOCKED verdict + abortReason and skips getReport when launchStatus=BLOCKED', async () => {
    const { getReport, listFindings, getAuditRun } = await import(
      '@/lib/api/audit-runs'
    );
    vi.mocked(getAuditRun).mockResolvedValue({
      id: 'run-1',
      launchStatus: 'BLOCKED',
      abortReason: 'REPO_TOO_LARGE',
      partialResultTools: [],
    } as never);
    // Will explode if called — proves the short-circuit holds.
    vi.mocked(getReport).mockRejectedValue(new Error('should not be called'));
    vi.mocked(listFindings).mockRejectedValue(
      new Error('should not be called')
    );

    const { default: DashboardPage } = await import('./page');
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-blocked')).toBeInTheDocument();
    });
    const panel = screen.getByTestId('dashboard-blocked');
    expect(panel).toHaveTextContent(/감사 중단 \(가드레일 작동\)/);
    expect(panel).toHaveTextContent(/REPO_TOO_LARGE/);
    expect(vi.mocked(getReport)).not.toHaveBeenCalled();
    expect(vi.mocked(listFindings)).not.toHaveBeenCalled();
  });

  // T2.12-FU #127: when the run is BLOCKED by a guardrail, the dashboard
  // verdict view must also mount PartialResultBanner with blockedContext so
  // the user sees the abortReason note even if partialResultTools is empty.
  it('mounts PartialResultBanner with blockedContext inside DashboardBlockedBody', async () => {
    const { getReport, listFindings, getAuditRun } = await import(
      '@/lib/api/audit-runs'
    );
    vi.mocked(getAuditRun).mockResolvedValue({
      id: 'run-1',
      launchStatus: 'BLOCKED',
      abortReason: 'REPO_TOO_LARGE',
      partialResultTools: [],
    } as never);
    vi.mocked(getReport).mockRejectedValue(new Error('should not be called'));
    vi.mocked(listFindings).mockRejectedValue(
      new Error('should not be called')
    );

    const { default: DashboardPage } = await import('./page');
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-blocked')).toBeInTheDocument();
    });
    const banner = screen.getByTestId('partial-result-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute('data-na-reason', 'blocked');
    expect(
      screen.getByTestId('partial-result-blocked-note')
    ).toHaveTextContent(/REPO_TOO_LARGE/);
  });

  // T2.12-FU #127: when the BLOCKED run also has partialResultTools, the
  // banner should surface the N/A category chips (semgrep → SECURITY_PRIVACY,
  // lighthouse → LAUNCH_READINESS) all labelled with the "blocked" reason.
  it('renders N/A category chips with blocked reason for BLOCKED + partialResultTools', async () => {
    const { getReport, listFindings, getAuditRun } = await import(
      '@/lib/api/audit-runs'
    );
    vi.mocked(getAuditRun).mockResolvedValue({
      id: 'run-1',
      launchStatus: 'BLOCKED',
      abortReason: 'BUDGET_EXCEEDED',
      partialResultTools: ['semgrep', 'lighthouse'],
    } as never);
    vi.mocked(getReport).mockRejectedValue(new Error('should not be called'));
    vi.mocked(listFindings).mockRejectedValue(
      new Error('should not be called')
    );

    const { default: DashboardPage } = await import('./page');
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-blocked')).toBeInTheDocument();
    });
    const banner = screen.getByTestId('partial-result-banner');
    expect(banner).toHaveAttribute('data-na-reason', 'blocked');
    expect(
      screen.getByTestId('partial-result-categories')
    ).toBeInTheDocument();
    // semgrep contributes both SECURITY_PRIVACY and FRONTEND_CODE; lighthouse
    // contributes LAUNCH_READINESS and UX_UI. All four chips must render.
    expect(
      screen.getByTestId('partial-result-category-SECURITY_PRIVACY')
    ).toHaveTextContent(/가드레일 작동으로 중단/);
    expect(
      screen.getByTestId('partial-result-category-LAUNCH_READINESS')
    ).toHaveTextContent(/가드레일 작동으로 중단/);
  });

  // T2.5-FU #139: re-audit diff link surfaces on the dashboard ONLY when the
  // current run has a previousRunId. First-time audits must not see a dangling
  // link to a comparison view that would render an empty state.
  it('renders "재감사 비교" link when run has previousRunId', async () => {
    const { getReport, listFindings, getAuditRun } = await import(
      '@/lib/api/audit-runs'
    );
    vi.mocked(getReport).mockResolvedValue({
      readinessScore: 70,
      launchStatus: 'NEEDS_WORK',
      executiveSummary: 'second audit',
      categoryScores: [],
      severityCounts: { P0: 0, P1: 0, P2: 0, P3: 0 },
    } as never);
    vi.mocked(listFindings).mockResolvedValue({
      findings: [],
      nextCursor: null,
    } as never);
    vi.mocked(getAuditRun).mockResolvedValue({
      id: 'run-2',
      partialResultTools: [],
      previousRunId: 'run-1',
    } as never);

    const { default: DashboardPage } = await import('./page');
    render(<DashboardPage />);

    await waitFor(() => {
      expect(
        screen.getByTestId('dashboard-rerun-diff-link')
      ).toBeInTheDocument();
    });
    expect(
      screen.getByTestId('dashboard-rerun-diff-link')
    ).toHaveAttribute('href', '/audits/run-1/diff');
  });

  it('hides "재감사 비교" link when run has no previousRunId (first audit)', async () => {
    const { getReport, listFindings, getAuditRun } = await import(
      '@/lib/api/audit-runs'
    );
    vi.mocked(getReport).mockResolvedValue({
      readinessScore: 70,
      launchStatus: 'NEEDS_WORK',
      executiveSummary: 'first audit',
      categoryScores: [],
      severityCounts: { P0: 0, P1: 0, P2: 0, P3: 0 },
    } as never);
    vi.mocked(listFindings).mockResolvedValue({
      findings: [],
      nextCursor: null,
    } as never);
    vi.mocked(getAuditRun).mockResolvedValue({
      id: 'run-1',
      partialResultTools: [],
    } as never);

    const { default: DashboardPage } = await import('./page');
    render(<DashboardPage />);

    await waitFor(() => {
      expect(
        screen.getByRole('navigation', { name: '감사 결과 탭' })
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId('dashboard-rerun-diff-link')
    ).not.toBeInTheDocument();
  });

  // S6-03: partial-results warn banner. When the audit run reports tools that
  // were SKIPPED, the dashboard must render the warn banner above the score
  // section so the user understands the score is degraded.
  it('renders partial-results warn banner when partialResultTools is non-empty', async () => {
    const { getReport, listFindings, getAuditRun } = await import(
      '@/lib/api/audit-runs'
    );
    vi.mocked(getReport).mockResolvedValue({
      readinessScore: 0,
      launchStatus: 'NEEDS_WORK',
      executiveSummary: 'partial',
      categoryScores: [],
      severityCounts: { P0: 0, P1: 0, P2: 0, P3: 0 },
    } as never);
    vi.mocked(listFindings).mockResolvedValue({
      findings: [],
      nextCursor: null,
    } as never);
    vi.mocked(getAuditRun).mockResolvedValue({
      id: 'run-1',
      partialResultTools: ['semgrep', 'osv-scanner'],
    } as never);

    const { default: DashboardPage } = await import('./page');
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId('partial-result-banner')).toBeInTheDocument();
    });
    const banner = screen.getByTestId('partial-result-banner');
    // New banner summary is count-based; per-tool labels live inside <details>.
    expect(banner).toHaveTextContent(/검사가 이번 분석에서 빠졌어요/);
    expect(banner).toHaveTextContent(/semgrep/);
    expect(banner).toHaveTextContent(/osv-scanner/);
  });
});
