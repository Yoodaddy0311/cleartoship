// EvidencePanel tests — verify the collapse/expand UX, accessibility
// attributes, the truncated banner gating, and that toggling the panel
// persists to localStorage so a reload (or re-mount with the same ruleId)
// restores the user's choice.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@cleartoship/ui', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@/components/evidences/evidence-list', () => ({
  EvidenceList: ({ items }: { items: unknown[] }) => (
    <ul data-testid="evidence-list-mock">count:{items.length}</ul>
  ),
}));

vi.mock('@/lib/i18n', () => ({
  t: (k: string) => k,
}));

const { EvidencePanel } = await import('./evidence-panel.js');

const items = [
  { id: 'e1', snippet: 'a()' },
  { id: 'e2', snippet: 'b()' },
];

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('EvidencePanel', () => {
  it('renders the trigger button with the evidence count and starts collapsed by default', () => {
    render(<EvidencePanel ruleId="rule-a" items={items as never} />);

    const trigger = screen.getByTestId('evidence-panel-trigger');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // 항목 수 표시 (visible "(2건)")
    expect(screen.getByTestId('evidence-panel-count')).toHaveTextContent('(2건)');
    // Region exists for the aria-controls target but is hidden while collapsed.
    const region = screen.getByRole('region', { hidden: true });
    expect(region).toHaveAttribute('hidden');
    // EvidenceList is NOT mounted in the collapsed state.
    expect(screen.queryByTestId('evidence-list-mock')).toBeNull();
  });

  it('expanding the panel reveals the EvidenceList and updates aria-expanded', () => {
    render(<EvidencePanel ruleId="rule-a" items={items as never} />);

    fireEvent.click(screen.getByTestId('evidence-panel-trigger'));

    const trigger = screen.getByTestId('evidence-panel-trigger');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('evidence-list-mock')).toHaveTextContent('count:2');
    // region is no longer hidden
    const region = screen.getByRole('region');
    expect(region).not.toHaveAttribute('hidden');
  });

  it('persists the open/closed state to localStorage under cts.evidence.collapsed.{ruleId}', () => {
    const KEY = 'cts.evidence.collapsed.rule-b';
    const { unmount } = render(
      <EvidencePanel ruleId="rule-b" items={items as never} />,
    );

    // Initial render: collapsed by default → nothing written until the user
    // interacts.
    expect(window.localStorage.getItem(KEY)).toBeNull();

    fireEvent.click(screen.getByTestId('evidence-panel-trigger'));
    expect(window.localStorage.getItem(KEY)).toBe('0'); // expanded

    // Re-mount with the same ruleId — the hook hydrates from localStorage
    // and the panel comes back already expanded.
    unmount();
    render(<EvidencePanel ruleId="rule-b" items={items as never} />);
    expect(screen.getByTestId('evidence-panel-trigger')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByTestId('evidence-list-mock')).toBeInTheDocument();
  });

  it('shows the truncated banner only when expanded AND truncated=true', () => {
    const { rerender } = render(
      <EvidencePanel ruleId="rule-c" items={items as never} truncated={true} />,
    );

    // Collapsed by default → banner not rendered (no point announcing while
    // the section is hidden).
    expect(screen.queryByTestId('evidence-truncated-banner')).toBeNull();

    // Expand → banner appears with role=status / aria-live=polite.
    fireEvent.click(screen.getByTestId('evidence-panel-trigger'));
    const banner = screen.getByTestId('evidence-truncated-banner');
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner).toHaveAttribute('aria-live', 'polite');
    expect(banner).toHaveTextContent('findings.detail.evidences.truncated');

    // truncated=false (or omitted) → no banner even when expanded.
    rerender(
      <EvidencePanel ruleId="rule-c" items={items as never} truncated={false} />,
    );
    expect(screen.queryByTestId('evidence-truncated-banner')).toBeNull();
  });
});
