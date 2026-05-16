// Behavioural test for the improvement-prd page.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/api/audit-runs', () => ({
  getImprovementPrd: vi.fn(),
}));

vi.mock('@/components/improvement-prd/copy-prompt-button', () => ({
  CopyPromptButton: () => <button>copy</button>,
}));
vi.mock('@/components/improvement-prd/prd-viewer', () => ({
  PrdViewer: ({ markdown }: { markdown: string }) => <div>{markdown}</div>,
}));
vi.mock('@/components/report/download-button', () => ({
  DownloadMarkdownButton: () => <button>download</button>,
}));

describe('ImprovementPrdPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports a default React component function', async () => {
    const mod = await import('./page');
    expect(typeof mod.default).toBe('function');
  });

  it('shows loading state initially (mocks return never-resolving Promise)', async () => {
    const { getImprovementPrd } = await import('@/lib/api/audit-runs');
    vi.mocked(getImprovementPrd).mockImplementation(() => new Promise(() => {}));

    const { default: ImprovementPrdPage } = await import('./page');
    render(<ImprovementPrdPage params={{ id: 'run-1' }} />);

    expect(
      screen.getByRole('heading', { level: 1 })
    ).toBeInTheDocument();
  });

  it('renders ready state when data resolves', async () => {
    const { getImprovementPrd } = await import('@/lib/api/audit-runs');
    vi.mocked(getImprovementPrd).mockResolvedValue({
      markdown: '# PRD',
    } as never);

    const { default: ImprovementPrdPage } = await import('./page');
    render(<ImprovementPrdPage params={{ id: 'run-1' }} />);

    await waitFor(() => {
      expect(vi.mocked(getImprovementPrd)).toHaveBeenCalledWith('run-1');
    });
  });

  it('renders error state when fetch fails', async () => {
    const { getImprovementPrd } = await import('@/lib/api/audit-runs');
    vi.mocked(getImprovementPrd).mockRejectedValue(new Error('boom'));

    const { default: ImprovementPrdPage } = await import('./page');
    render(<ImprovementPrdPage params={{ id: 'run-1' }} />);

    await waitFor(() => {
      expect(screen.getByText(/오류가 발생/)).toBeInTheDocument();
    });
  });
});
