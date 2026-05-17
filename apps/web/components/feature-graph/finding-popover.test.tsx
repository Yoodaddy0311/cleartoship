import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FindingPopover } from './finding-popover';

describe('FindingPopover', () => {
  it('renders an accessible dialog labelled by the source node', () => {
    render(
      <FindingPopover
        nodeId="n1"
        nodeLabel="Dashboard"
        findingIds={['a', 'b']}
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute(
      'aria-labelledby',
      'finding-popover-title-n1'
    );
    expect(screen.getByText(/Dashboard/)).toBeInTheDocument();
    expect(screen.getByText(/관련 Finding 2건/)).toBeInTheDocument();
  });

  it('invokes onSelect with the picked finding id', () => {
    const onSelect = vi.fn();
    render(
      <FindingPopover
        nodeId="n1"
        nodeLabel="Dashboard"
        findingIds={['fa', 'fb']}
        onSelect={onSelect}
        onDismiss={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /fb/ }));
    expect(onSelect).toHaveBeenCalledWith('fb');
  });

  it('dismisses on the close button and on Escape', () => {
    const onDismiss = vi.fn();
    render(
      <FindingPopover
        nodeId="n1"
        nodeLabel="Dashboard"
        findingIds={['fa']}
        onSelect={vi.fn()}
        onDismiss={onDismiss}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '목록 닫기' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it('focuses the first finding row when mounted', () => {
    render(
      <FindingPopover
        nodeId="n1"
        nodeLabel="Dashboard"
        findingIds={['first', 'second']}
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    const firstRow = screen.getByRole('button', { name: /first/ });
    expect(firstRow).toHaveFocus();
  });
});
