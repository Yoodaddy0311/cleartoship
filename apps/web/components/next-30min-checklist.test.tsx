/// <reference types="@testing-library/jest-dom" />
// W2.C5.1 — Next30MinChecklist behavioural tests.
//
// Five contract pillars (each → its own test):
//   1. ETA > 30 is filtered out (60-min item never renders).
//   2. Cap at 3 even when 5 candidates qualify.
//   3. Severity desc sort (P0 before P3) regardless of input order.
//   4. Toggling a checkbox persists across a remount (real localStorage).
//   5. Empty input renders the i18n empty state (and `emptyText` override).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Next30MinChecklist, type ChecklistItem } from './next-30min-checklist';
import { t } from '@/lib/i18n';

const STORAGE_KEY = 'audit-test-run';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

function makeItem(overrides: Partial<ChecklistItem>): ChecklistItem {
  return {
    id: overrides.id ?? 'item-default',
    title: overrides.title ?? 'Some quick fix',
    etaMinutes: overrides.etaMinutes ?? 5,
    href: overrides.href,
    severity: overrides.severity,
  };
}

describe('Next30MinChecklist — W2.C5.1', () => {
  it('filters out items with ETA above 30 minutes', () => {
    const items: ChecklistItem[] = [
      makeItem({ id: 'fast', title: 'Fast fix', etaMinutes: 5, severity: 'P1' }),
      makeItem({
        id: 'slow',
        title: 'Slow fix (1 hour)',
        etaMinutes: 60,
        severity: 'P0',
      }),
      makeItem({
        id: 'edge',
        title: 'Edge: exactly 30',
        etaMinutes: 30,
        severity: 'P2',
      }),
    ];

    render(<Next30MinChecklist storageKey={STORAGE_KEY} items={items} />);

    // ETA <= 30 are kept (fast, edge); ETA > 30 dropped (slow).
    expect(screen.getByTestId('next-30min-item-fast')).toBeInTheDocument();
    expect(screen.getByTestId('next-30min-item-edge')).toBeInTheDocument();
    expect(screen.queryByTestId('next-30min-item-slow')).not.toBeInTheDocument();
  });

  it('caps the rendered list at 3 items even when more candidates qualify', () => {
    const items: ChecklistItem[] = [
      makeItem({ id: 'a', etaMinutes: 5, severity: 'P0' }),
      makeItem({ id: 'b', etaMinutes: 5, severity: 'P0' }),
      makeItem({ id: 'c', etaMinutes: 5, severity: 'P0' }),
      makeItem({ id: 'd', etaMinutes: 5, severity: 'P0' }),
      makeItem({ id: 'e', etaMinutes: 5, severity: 'P0' }),
    ];

    render(<Next30MinChecklist storageKey={STORAGE_KEY} items={items} />);

    const rendered = screen.getAllByRole('listitem');
    expect(rendered).toHaveLength(3);
  });

  it('sorts by severity desc (P0 first) regardless of input order', () => {
    // Deliberately misorder severity so the sort is exercised.
    const items: ChecklistItem[] = [
      makeItem({ id: 'lowest', title: 'P3 item', etaMinutes: 10, severity: 'P3' }),
      makeItem({ id: 'mid', title: 'P1 item', etaMinutes: 10, severity: 'P1' }),
      makeItem({ id: 'top', title: 'P0 item', etaMinutes: 10, severity: 'P0' }),
    ];

    render(<Next30MinChecklist storageKey={STORAGE_KEY} items={items} />);

    const list = screen.getByRole('list');
    const itemEls = list.querySelectorAll('[data-testid^="next-30min-item-"]');
    expect(itemEls[0]).toHaveAttribute('data-testid', 'next-30min-item-top');
    expect(itemEls[1]).toHaveAttribute('data-testid', 'next-30min-item-mid');
    expect(itemEls[2]).toHaveAttribute('data-testid', 'next-30min-item-lowest');
  });

  it('persists checkbox state across an unmount/remount cycle', () => {
    const items: ChecklistItem[] = [
      makeItem({ id: 'persist-me', title: 'Persist this', etaMinutes: 10, severity: 'P1' }),
    ];

    const { unmount } = render(
      <Next30MinChecklist storageKey={STORAGE_KEY} items={items} />,
    );

    const checkbox = screen.getByRole('checkbox', { name: 'Persist this' });
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    // Underlying row is checked + line-through applied via data-checked.
    expect(screen.getByTestId('next-30min-item-persist-me')).toHaveAttribute(
      'data-checked',
      'true',
    );

    unmount();
    cleanup();

    // Re-render with the same storage key → hydrate from localStorage.
    render(<Next30MinChecklist storageKey={STORAGE_KEY} items={items} />);
    const rehydrated = screen.getByRole('checkbox', { name: 'Persist this' });
    expect(rehydrated).toBeChecked();
    expect(screen.getByTestId('next-30min-item-persist-me')).toHaveAttribute(
      'data-checked',
      'true',
    );
  });

  it('renders the i18n empty state when no items qualify; emptyText prop overrides it', () => {
    // Case A: empty input → i18n default.
    const { unmount } = render(
      <Next30MinChecklist storageKey={STORAGE_KEY} items={[]} />,
    );
    expect(screen.getByTestId('next-30min-empty')).toHaveTextContent(
      t('next30Min.empty'),
    );
    // No list rendered.
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    unmount();
    cleanup();

    // Case B: emptyText override.
    render(
      <Next30MinChecklist
        storageKey={STORAGE_KEY}
        items={[]}
        emptyText="Nothing to do — go ship"
      />,
    );
    expect(screen.getByTestId('next-30min-empty')).toHaveTextContent(
      'Nothing to do — go ship',
    );
  });
});
