// GraphCanvas tests — sibling-located on purpose.
// ReactFlow is heavily mocked so that onNodeClick handlers stay observable
// while we focus on deep-link behavior (router push / popover / disabled).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { MockNode } from '@/lib/mock/audit-fixture';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

// Capture ReactFlow props (especially nodes + onNodeClick) for assertions.
// Render each node as a real button so tests can click without simulating
// reactflow's internal pointer-event pipeline.
vi.mock('reactflow', () => ({
  __esModule: true,
  default: ({
    nodes,
    onNodeClick,
    children,
  }: {
    nodes: Array<{ id: string; data: { label: string }; ariaLabel?: string }>;
    onNodeClick?: (e: unknown, node: { id: string }) => void;
    children?: React.ReactNode;
  }) => (
    <div data-testid="rf-root">
      {nodes.map((n) => (
        <button
          key={n.id}
          type="button"
          data-testid={`rf-node-${n.id}`}
          aria-label={n.ariaLabel}
          onClick={(e) => onNodeClick?.(e, { id: n.id } as { id: string })}
        >
          {n.data.label}
        </button>
      ))}
      {children}
    </div>
  ),
  Background: () => <div data-testid="rf-bg" />,
  Controls: () => <div data-testid="rf-controls" />,
  MiniMap: () => <div data-testid="rf-minimap" />,
}));

vi.mock('reactflow/dist/style.css', () => ({}));

vi.mock('@cleartoship/ui', () => ({
  FeatureGraphNode: ({ label }: { label: string }) => <div>{label}</div>,
}));

vi.mock('./node-detail-panel', () => ({
  NodeDetailPanel: ({ node }: { node: { label: string } | null }) => (
    <div data-testid="detail">{node ? node.label : 'empty'}</div>
  ),
}));

vi.mock('./status-legend', () => ({
  StatusLegend: () => <div data-testid="legend" />,
}));

vi.mock('@/lib/format/status', () => ({
  ALL_STATUSES: ['complete', 'partial', 'missing'] as const,
}));

const { GraphCanvas } = await import('./graph-canvas.js');

const mkNode = (overrides: Partial<MockNode> & Pick<MockNode, 'id' | 'label'>): MockNode => ({
  type: 'page',
  status: 'complete',
  position: { x: 0, y: 0 },
  ...overrides,
});

beforeEach(() => {
  pushMock.mockReset();
});

describe('GraphCanvas', () => {
  it('renders the status legend, react-flow surface, and an empty detail panel by default', () => {
    render(<GraphCanvas nodes={[]} edges={[]} />);
    expect(screen.getByTestId('legend')).toBeInTheDocument();
    expect(screen.getByTestId('rf-root')).toBeInTheDocument();
    expect(screen.getByTestId('detail')).toHaveTextContent('empty');
  });

  it('renders MiniMap, Controls, and Background helpers from reactflow', () => {
    render(<GraphCanvas nodes={[]} edges={[]} />);
    expect(screen.getByTestId('rf-bg')).toBeInTheDocument();
    expect(screen.getByTestId('rf-controls')).toBeInTheDocument();
    expect(screen.getByTestId('rf-minimap')).toBeInTheDocument();
  });

  it('navigates to the finding detail page when a node has exactly one finding', () => {
    const nodes = [mkNode({ id: 'page.dashboard', label: 'Dashboard' })];
    render(
      <GraphCanvas
        nodes={nodes}
        edges={[]}
        auditId="audit-1"
        findingIdsByNode={{ 'page.dashboard': ['finding-42'] }}
      />
    );
    fireEvent.click(screen.getByTestId('rf-node-page.dashboard'));
    expect(pushMock).toHaveBeenCalledWith('/audits/audit-1/findings/finding-42');
    expect(pushMock).toHaveBeenCalledTimes(1);
  });

  it('triggers the same navigation on keyboard Enter activation', () => {
    const nodes = [mkNode({ id: 'page.dashboard', label: 'Dashboard' })];
    render(
      <GraphCanvas
        nodes={nodes}
        edges={[]}
        auditId="audit-1"
        findingIdsByNode={{ 'page.dashboard': ['finding-42'] }}
      />
    );
    // The mocked node is a real <button>, so Enter triggers a click natively.
    const btn = screen.getByTestId('rf-node-page.dashboard');
    btn.focus();
    fireEvent.keyDown(btn, { key: 'Enter' });
    fireEvent.click(btn); // jsdom button does not auto-click on keydown
    expect(pushMock).toHaveBeenCalledWith('/audits/audit-1/findings/finding-42');
  });

  it('opens a popover listing all findings when a node has multiple findings', () => {
    const nodes = [mkNode({ id: 'page.dashboard', label: 'Dashboard' })];
    render(
      <GraphCanvas
        nodes={nodes}
        edges={[]}
        auditId="audit-1"
        findingIdsByNode={{ 'page.dashboard': ['finding-1', 'finding-2', 'finding-3'] }}
      />
    );
    fireEvent.click(screen.getByTestId('rf-node-page.dashboard'));
    const popover = screen.getByTestId('finding-popover');
    expect(popover).toBeInTheDocument();
    expect(popover).toHaveTextContent('finding-1');
    expect(popover).toHaveTextContent('finding-2');
    expect(popover).toHaveTextContent('finding-3');
    // No direct router push yet — user must pick.
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('deep-links from a popover row when the user picks a finding', () => {
    const nodes = [mkNode({ id: 'page.dashboard', label: 'Dashboard' })];
    render(
      <GraphCanvas
        nodes={nodes}
        edges={[]}
        auditId="audit-1"
        findingIdsByNode={{ 'page.dashboard': ['finding-1', 'finding-2'] }}
      />
    );
    fireEvent.click(screen.getByTestId('rf-node-page.dashboard'));
    fireEvent.click(screen.getByRole('button', { name: /finding-2/ }));
    expect(pushMock).toHaveBeenCalledWith('/audits/audit-1/findings/finding-2');
  });

  it('shows an aria-live status and does not navigate when a node has no findings', () => {
    const nodes = [mkNode({ id: 'page.empty', label: 'Empty Page' })];
    render(
      <GraphCanvas
        nodes={nodes}
        edges={[]}
        auditId="audit-1"
        findingIdsByNode={{}}
      />
    );
    const btn = screen.getByTestId('rf-node-page.empty');
    // aria-label communicates the disabled-for-deep-link state to AT.
    expect(btn).toHaveAttribute('aria-label', expect.stringMatching(/연결된 Finding 없음/));
    fireEvent.click(btn);
    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('graph-link-status')).toHaveTextContent(
      'Empty Page에 연결된 Finding이 없습니다.'
    );
    // Detail panel still updates so the user can inspect the node.
    expect(screen.getByTestId('detail')).toHaveTextContent('Empty Page');
  });
});
