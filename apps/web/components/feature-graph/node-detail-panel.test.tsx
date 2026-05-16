// NodeDetailPanel tests — sibling-located on purpose.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@cleartoship/ui', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <section className={className}>{children}</section>
  ),
  CardBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  Badge: ({ children }: { children: React.ReactNode }) => <span data-testid="badge">{children}</span>,
}));

vi.mock('@/components/common/status-chip', () => ({
  StatusChip: ({ status }: { status: string }) => <span data-testid="status">{status}</span>,
}));

vi.mock('@/lib/i18n', () => ({
  t: (k: string) => k,
}));

const { NodeDetailPanel } = await import('./node-detail-panel.js');

describe('NodeDetailPanel', () => {
  it('renders an empty-state hint when no node is selected', () => {
    render(<NodeDetailPanel node={null} />);
    expect(
      screen.getByText('그래프에서 노드를 선택하면 상세 정보가 표시됩니다.'),
    ).toBeInTheDocument();
  });

  it('renders the node label, type badge, and status chip', () => {
    render(
      <NodeDetailPanel
        node={{
          id: 'n1',
          label: 'Auth Flow',
          type: 'route',
          status: 'partial',
          summary: 'desc',
        } as never}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Auth Flow' })).toBeInTheDocument();
    expect(screen.getByTestId('badge')).toHaveTextContent('route');
    expect(screen.getByTestId('status')).toHaveTextContent('partial');
  });

  it('omits the summary block when summary is missing', () => {
    render(
      <NodeDetailPanel
        node={{
          id: 'n2',
          label: 'No Summary',
          type: 'page',
          status: 'complete',
        } as never}
      />,
    );
    expect(screen.queryByText('graph.node.summary')).not.toBeInTheDocument();
  });
});
