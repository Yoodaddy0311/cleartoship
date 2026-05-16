// GraphCanvas tests — sibling-located on purpose.
// ReactFlow is heavily mocked: we only assert composition + StatusLegend + NodeDetailPanel.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('reactflow', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="rf-root">{children}</div>
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
});
