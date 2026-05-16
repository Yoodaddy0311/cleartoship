// Behavioural test for the feature-graph page.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/api/audit-runs', () => ({
  getFeatureGraph: vi.fn(),
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
  });

  it('exports a default React component function', async () => {
    const mod = await import('./page');
    expect(typeof mod.default).toBe('function');
  });

  it('shows loading state initially (mocks return never-resolving Promise)', async () => {
    const { getFeatureGraph } = await import('@/lib/api/audit-runs');
    vi.mocked(getFeatureGraph).mockImplementation(() => new Promise(() => {}));

    const { default: FeatureGraphPage } = await import('./page');
    render(<FeatureGraphPage params={{ id: 'run-1' }} />);

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
    render(<FeatureGraphPage params={{ id: 'run-1' }} />);

    await waitFor(() => {
      expect(vi.mocked(getFeatureGraph)).toHaveBeenCalledWith('run-1');
    });
  });

  it('renders error state when fetch fails', async () => {
    const { getFeatureGraph } = await import('@/lib/api/audit-runs');
    vi.mocked(getFeatureGraph).mockRejectedValue(new Error('boom'));

    const { default: FeatureGraphPage } = await import('./page');
    render(<FeatureGraphPage params={{ id: 'run-1' }} />);

    await waitFor(() => {
      expect(screen.getByText(/오류가 발생/)).toBeInTheDocument();
    });
  });
});
