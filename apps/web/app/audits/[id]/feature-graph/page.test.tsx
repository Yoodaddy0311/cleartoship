// Behavioural test for the feature-graph page.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const routerPushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'run-1' }),
  useRouter: () => ({ push: routerPushMock, refresh: vi.fn() }),
}));

vi.mock('@/lib/api/audit-runs', () => ({
  getFeatureGraph: vi.fn(),
  listEvidences: vi.fn(() =>
    Promise.resolve({ evidences: [], truncated: false })
  ),
  getAuditRun: vi.fn(),
  createAuditRun: vi.fn(),
}));

// next/dynamic returns a lazy component; stub it to a placeholder so the
// reactflow-backed GraphCanvas import chain doesn't need to resolve.
vi.mock('next/dynamic', () => ({
  default: () => () => <div data-stub="graph-canvas" />,
}));

vi.mock('@/lib/api/adapters', () => ({
  adaptFeatureGraph: vi.fn(() => ({ nodes: [], edges: [] })),
}));

describe('FeatureGraphPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routerPushMock.mockReset();
  });

  it('exports a default React component function', async () => {
    const mod = await import('./page');
    expect(typeof mod.default).toBe('function');
  });

  it('shows loading state initially (mocks return never-resolving Promise)', async () => {
    const { getFeatureGraph } = await import('@/lib/api/audit-runs');
    vi.mocked(getFeatureGraph).mockImplementation(() => new Promise(() => {}));

    const { default: FeatureGraphPage } = await import('./page');
    render(<FeatureGraphPage />);

    expect(
      screen.getByRole('heading', { level: 1 })
    ).toBeInTheDocument();
  });

  it('renders ready state when data resolves', async () => {
    const { getFeatureGraph } = await import('@/lib/api/audit-runs');
    vi.mocked(getFeatureGraph).mockResolvedValue({
      nodes: [],
      edges: [],
    } as never);

    const { default: FeatureGraphPage } = await import('./page');
    render(<FeatureGraphPage />);

    await waitFor(() => {
      expect(vi.mocked(getFeatureGraph)).toHaveBeenCalledWith('run-1');
    });
  });

  it('renders error state when fetch fails', async () => {
    const { getFeatureGraph } = await import('@/lib/api/audit-runs');
    vi.mocked(getFeatureGraph).mockRejectedValue(new Error('boom'));

    const { default: FeatureGraphPage } = await import('./page');
    render(<FeatureGraphPage />);

    await waitFor(() => {
      expect(screen.getByText(/오류가 발생/)).toBeInTheDocument();
    });
  });

  // When the pipeline finishes but produces zero feature nodes, the page
  // surfaces an empty-state explaining the likely causes and offering a
  // "다시 분석" CTA that re-enqueues the same repoUrl.
  it('renders empty-state with updated copy + dashboard link + rerun CTA', async () => {
    const { getFeatureGraph } = await import('@/lib/api/audit-runs');
    vi.mocked(getFeatureGraph).mockResolvedValue({
      nodes: [],
      edges: [],
    } as never);

    const { default: FeatureGraphPage } = await import('./page');
    render(<FeatureGraphPage />);

    await waitFor(() => {
      expect(screen.getByTestId('feature-graph-empty')).toBeInTheDocument();
    });
    const panel = screen.getByTestId('feature-graph-empty');
    // New copy — does not blame "unsupported framework" anymore.
    expect(panel).toHaveTextContent(/기능 노드가 비어 있어요/);
    expect(panel).toHaveTextContent(/이전 버전 분석 결과/);
    expect(panel).toHaveTextContent(/빌드 산출물만 있는 레포/);
    // Old misleading wording must be gone.
    expect(panel).not.toHaveTextContent(/지원 프레임워크가 아니거나/);
    // Dashboard link preserved.
    expect(panel).toHaveTextContent(/대시보드/);
    // Rerun CTA present.
    expect(
      screen.getByTestId('feature-graph-empty-rerun')
    ).toHaveTextContent(/다시 분석/);
  });

  it('rerun CTA re-enqueues same repoUrl and navigates to the new run', async () => {
    const { getFeatureGraph, getAuditRun, createAuditRun } = await import(
      '@/lib/api/audit-runs'
    );
    vi.mocked(getFeatureGraph).mockResolvedValue({
      nodes: [],
      edges: [],
    } as never);
    vi.mocked(getAuditRun).mockResolvedValue({
      id: 'run-1',
      repoUrl: 'https://github.com/o/r',
      deployUrl: null,
      prdText: null,
    } as never);
    vi.mocked(createAuditRun).mockResolvedValue({
      auditRunId: 'run-2',
      projectId: 'proj-1',
      status: 'PENDING',
    } as never);

    const { default: FeatureGraphPage } = await import('./page');
    render(<FeatureGraphPage />);

    const btn = await screen.findByTestId('feature-graph-empty-rerun');
    fireEvent.click(btn);

    await waitFor(() => {
      expect(vi.mocked(createAuditRun)).toHaveBeenCalledWith(
        expect.objectContaining({ repoUrl: 'https://github.com/o/r' })
      );
    });
    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith('/audits/run-2');
    });
  });

  // PERF-N1 regression guard: secondary evidence fetch must collapse to a
  // single `listEvidences(auditId)` round-trip — not a per-finding loop.
  it('issues exactly one listEvidences call (no per-finding N+1)', async () => {
    const { getFeatureGraph, listEvidences } = await import(
      '@/lib/api/audit-runs'
    );
    vi.mocked(getFeatureGraph).mockResolvedValue({
      nodes: [],
      edges: [],
    } as never);
    vi.mocked(listEvidences).mockResolvedValue({
      evidences: [],
      truncated: false,
    } as never);

    const { default: FeatureGraphPage } = await import('./page');
    render(<FeatureGraphPage />);

    await waitFor(() => {
      expect(vi.mocked(listEvidences)).toHaveBeenCalledWith('run-1');
    });
    expect(vi.mocked(listEvidences)).toHaveBeenCalledTimes(1);
  });

  it('rerun CTA surfaces an error message when the request fails', async () => {
    const { getFeatureGraph, getAuditRun, createAuditRun } = await import(
      '@/lib/api/audit-runs'
    );
    vi.mocked(getFeatureGraph).mockResolvedValue({
      nodes: [],
      edges: [],
    } as never);
    vi.mocked(getAuditRun).mockResolvedValue({
      id: 'run-1',
      repoUrl: 'https://github.com/o/r',
      deployUrl: null,
      prdText: null,
    } as never);
    vi.mocked(createAuditRun).mockRejectedValue(new Error('quota exceeded'));

    const { default: FeatureGraphPage } = await import('./page');
    render(<FeatureGraphPage />);

    const btn = await screen.findByTestId('feature-graph-empty-rerun');
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/quota exceeded/);
    });
    expect(routerPushMock).not.toHaveBeenCalled();
  });
});
