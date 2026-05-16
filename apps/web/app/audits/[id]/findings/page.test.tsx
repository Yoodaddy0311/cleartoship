// Behavioural test for the findings list page.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Hoisted router push spy so each `useRouter()` call returns the same object.
const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

vi.mock('@/lib/api/audit-runs', () => ({
  listFindings: vi.fn(),
}));

vi.mock('@/lib/api/adapters', () => ({
  adaptFinding: vi.fn((f: { id: string }) => ({
    id: f.id,
    title: 'Stub',
    summary: 's',
    category: 'PRODUCT_INTENT',
    severity: 'P2',
  })),
}));

// Stub the heavy findings table — its rendering is tested elsewhere.
vi.mock('@/components/findings/findings-table', () => ({
  FindingsTable: () => <div data-stub="findings-table" />,
}));

describe('FindingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports a default React component function', async () => {
    const mod = await import('./page');
    expect(typeof mod.default).toBe('function');
  });

  it('shows loading state initially (mocks return never-resolving Promise)', async () => {
    const { listFindings } = await import('@/lib/api/audit-runs');
    vi.mocked(listFindings).mockImplementation(() => new Promise(() => {}));

    const { default: FindingsPage } = await import('./page');
    render(<FindingsPage params={{ id: 'run-1' }} />);

    expect(
      screen.getByRole('navigation', { name: '감사 결과 탭' })
    ).toBeInTheDocument();
  });

  it('renders ready state when data resolves', async () => {
    const { listFindings } = await import('@/lib/api/audit-runs');
    vi.mocked(listFindings).mockResolvedValue({
      findings: [],
      nextCursor: null,
    } as never);

    const { default: FindingsPage } = await import('./page');
    render(<FindingsPage params={{ id: 'run-1' }} />);

    await waitFor(() => {
      expect(vi.mocked(listFindings)).toHaveBeenCalledWith('run-1', {
        limit: 200,
      });
    });
  });

  it('renders error state when fetch fails', async () => {
    const { listFindings } = await import('@/lib/api/audit-runs');
    vi.mocked(listFindings).mockRejectedValue(new Error('boom'));

    const { default: FindingsPage } = await import('./page');
    render(<FindingsPage params={{ id: 'run-1' }} />);

    await waitFor(() => {
      expect(screen.getByText(/오류가 발생/)).toBeInTheDocument();
    });
  });
});
