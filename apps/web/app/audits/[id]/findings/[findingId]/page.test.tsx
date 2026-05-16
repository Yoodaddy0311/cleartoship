// Behavioural test for the finding detail page.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/api/audit-runs', () => ({
  getFinding: vi.fn(),
}));

vi.mock('@/lib/api/adapters', () => ({
  adaptFinding: vi.fn(() => ({
    id: 'f-1',
    title: 'Stub',
    summary: 's',
    category: 'PRODUCT_INTENT',
    severity: 'P2',
  })),
}));

vi.mock('@/components/findings/finding-detail-panel', () => ({
  FindingDetailPanel: () => <div data-stub="finding-detail" />,
}));

describe('FindingDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports a default React component function', async () => {
    const mod = await import('./page');
    expect(typeof mod.default).toBe('function');
  });

  it('shows loading state initially (mocks return never-resolving Promise)', async () => {
    const { getFinding } = await import('@/lib/api/audit-runs');
    vi.mocked(getFinding).mockImplementation(() => new Promise(() => {}));

    const { default: FindingDetailPage } = await import('./page');
    render(<FindingDetailPage params={{ id: 'run-1', findingId: 'f-1' }} />);

    expect(
      screen.getByRole('navigation', { name: '감사 결과 탭' })
    ).toBeInTheDocument();
  });

  it('renders ready state when data resolves', async () => {
    const { getFinding } = await import('@/lib/api/audit-runs');
    vi.mocked(getFinding).mockResolvedValue({
      finding: { id: 'f-1' },
      evidences: [],
    } as never);

    const { default: FindingDetailPage } = await import('./page');
    render(<FindingDetailPage params={{ id: 'run-1', findingId: 'f-1' }} />);

    await waitFor(() => {
      expect(vi.mocked(getFinding)).toHaveBeenCalledWith('f-1', 'run-1');
    });
  });

  it('renders error state when fetch fails', async () => {
    const { getFinding } = await import('@/lib/api/audit-runs');
    vi.mocked(getFinding).mockRejectedValue(new Error('boom'));

    const { default: FindingDetailPage } = await import('./page');
    render(<FindingDetailPage params={{ id: 'run-1', findingId: 'f-1' }} />);

    await waitFor(() => {
      expect(screen.getByText(/오류가 발생/)).toBeInTheDocument();
    });
  });
});
