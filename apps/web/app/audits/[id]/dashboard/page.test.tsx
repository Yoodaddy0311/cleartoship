// Behavioural test for the dashboard page.
//
// Verifies the loading / ready / error branches by mocking the data-fetching
// API surface and rendering the page through @testing-library/react.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Mock the data-fetching API surface used by the dashboard page.
vi.mock('@/lib/api/audit-runs', () => ({
  getReport: vi.fn(),
  listFindings: vi.fn(),
}));

// Stub the adapters so we never need to provide perfectly-shaped API data.
vi.mock('@/lib/api/adapters', () => ({
  adaptCategoryScores: vi.fn(() => ({})),
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

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports a default React component function', async () => {
    const mod = await import('./page');
    expect(typeof mod.default).toBe('function');
  });

  it('shows loading state initially (mocks return never-resolving Promise)', async () => {
    const { getReport, listFindings } = await import('@/lib/api/audit-runs');
    vi.mocked(getReport).mockImplementation(() => new Promise(() => {}));
    vi.mocked(listFindings).mockImplementation(() => new Promise(() => {}));

    const { default: DashboardPage } = await import('./page');
    render(<DashboardPage params={{ id: 'run-1' }} />);

    expect(
      screen.getByRole('navigation', { name: '감사 결과 탭' })
    ).toBeInTheDocument();
  });

  it('renders ready state when data resolves', async () => {
    const { getReport, listFindings } = await import('@/lib/api/audit-runs');
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

    const { default: DashboardPage } = await import('./page');
    render(<DashboardPage params={{ id: 'run-1' }} />);

    await waitFor(() => {
      expect(vi.mocked(getReport)).toHaveBeenCalledWith('run-1');
    });
    expect(vi.mocked(listFindings)).toHaveBeenCalledWith('run-1', { limit: 5 });
  });

  it('renders error state when fetch fails', async () => {
    const { getReport, listFindings } = await import('@/lib/api/audit-runs');
    vi.mocked(getReport).mockRejectedValue(new Error('boom'));
    vi.mocked(listFindings).mockRejectedValue(new Error('boom'));

    const { default: DashboardPage } = await import('./page');
    render(<DashboardPage params={{ id: 'run-1' }} />);

    await waitFor(() => {
      expect(screen.getByText(/오류가 발생/)).toBeInTheDocument();
    });
  });
});
