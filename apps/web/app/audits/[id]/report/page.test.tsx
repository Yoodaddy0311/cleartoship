// Behavioural test for the report page.
//
// The report page reads its data via `useAuditResource`, so we mock that hook
// directly to drive the three render branches (loading / ready / error).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'run-1' }),
}));

vi.mock('@/lib/api/audit-runs', () => ({
  getReport: vi.fn(),
}));

vi.mock('@/lib/api/use-audit-resource', () => ({
  useAuditResource: vi.fn(() => ({ status: 'loading' })),
}));

vi.mock('@/components/report/markdown-viewer', () => ({
  MarkdownViewer: ({ markdown }: { markdown: string }) => (
    <div data-stub="markdown-viewer">{markdown}</div>
  ),
}));

vi.mock('@/components/report/download-button', () => ({
  DownloadMarkdownButton: () => <button>download</button>,
}));

describe('ReportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports a default React component function', async () => {
    const mod = await import('./page');
    expect(typeof mod.default).toBe('function');
  });

  it('shows loading state initially (useAuditResource returns status=loading)', async () => {
    const { useAuditResource } = await import('@/lib/api/use-audit-resource');
    vi.mocked(useAuditResource).mockReturnValue({ status: 'loading' } as never);

    const { default: ReportPage } = await import('./page');
    render(<ReportPage />);

    expect(
      screen.getByRole('navigation', { name: '감사 결과 탭' })
    ).toBeInTheDocument();
  });

  it('renders ready state when getReport resolves with markdown', async () => {
    const { useAuditResource } = await import('@/lib/api/use-audit-resource');
    vi.mocked(useAuditResource).mockReturnValue({
      status: 'ready',
      data: { markdown: '# Report Title' },
    } as never);

    const { default: ReportPage } = await import('./page');
    render(<ReportPage />);

    expect(screen.getByText('# Report Title')).toBeInTheDocument();
  });

  it('renders error state when fetch fails', async () => {
    const { useAuditResource } = await import('@/lib/api/use-audit-resource');
    vi.mocked(useAuditResource).mockReturnValue({
      status: 'error',
      message: 'boom',
    } as never);

    const { default: ReportPage } = await import('./page');
    render(<ReportPage />);

    expect(screen.getByText(/오류/)).toBeInTheDocument();
  });
});
