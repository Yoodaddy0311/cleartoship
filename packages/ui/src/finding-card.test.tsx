/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FindingCard } from './finding-card';

describe('FindingCard', () => {
  it('renders title, ruleId, file:line, and category', () => {
    render(
      <FindingCard
        severity="P1"
        title="Hardcoded secret detected"
        ruleId="secrets.hardcoded-token"
        filePath="src/config.ts"
        line={42}
        category="Security"
      />
    );

    expect(screen.getByText('Hardcoded secret detected')).toBeInTheDocument();
    expect(screen.getByText('secrets.hardcoded-token')).toBeInTheDocument();
    expect(screen.getByText('src/config.ts:42')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
  });

  it('invokes action callbacks when their buttons are clicked', () => {
    const onView = vi.fn();
    const onConfirm = vi.fn();
    const onDismiss = vi.fn();

    render(
      <FindingCard
        severity="P0"
        title="t"
        ruleId="r"
        filePath="f"
        line={1}
        category="c"
        onView={onView}
        onConfirm={onConfirm}
        onDismiss={onDismiss}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onView).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('exposes severity via data-severity attribute', () => {
    const { container } = render(
      <FindingCard
        severity="P2"
        title="t"
        ruleId="r"
        filePath="f"
        line={1}
        category="c"
      />
    );
    const article = container.querySelector('article');
    expect(article?.getAttribute('data-severity')).toBe('P2');
  });

  it('exposes WCAG-compliant focus-visible outline on every action button', () => {
    render(
      <FindingCard
        severity="P0"
        title="t"
        ruleId="r"
        filePath="f"
        line={1}
        category="c"
        onView={() => {}}
        onConfirm={() => {}}
        onDismiss={() => {}}
      />
    );
    for (const name of ['View', 'Confirm', 'Dismiss']) {
      const btn = screen.getByRole('button', { name });
      expect(btn.className).toMatch(/focus-visible:outline-2/);
      expect(btn.className).toMatch(/focus-visible:outline-\[color:var\(--mk-accent\)\]/);
    }
  });
});
