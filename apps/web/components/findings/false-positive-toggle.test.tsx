// FalsePositiveToggle (controlled) — sibling-located.
//
// Verifies the presentational contract: aria-pressed mirrors state, the Korean
// labels switch on flip, the error region shows up only when an Error is
// passed, and the button is disabled while loading/saving.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@cleartoship/ui', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

const { FalsePositiveToggle } = await import('./false-positive-toggle.js');

function baseProps(overrides: Partial<Parameters<typeof FalsePositiveToggle>[0]> = {}) {
  return {
    isFalsePositive: false,
    loading: false,
    saving: false,
    error: null,
    onToggle: vi.fn(),
    ...overrides,
  };
}

describe('FalsePositiveToggle', () => {
  it('renders the unmarked Korean label by default with aria-pressed=false', () => {
    render(<FalsePositiveToggle {...baseProps()} />);
    const btn = screen.getByTestId('false-positive-toggle');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(btn).toHaveAttribute('aria-label', '오탐 표시');
    expect(btn).toHaveTextContent('오탐 표시');
    expect(btn).not.toBeDisabled();
  });

  it('switches to the "marked" label + aria-pressed=true when flagged', () => {
    render(<FalsePositiveToggle {...baseProps({ isFalsePositive: true })} />);
    const btn = screen.getByTestId('false-positive-toggle');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(btn).toHaveTextContent('오탐으로 표시됨');
  });

  it('invokes onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<FalsePositiveToggle {...baseProps({ onToggle })} />);
    fireEvent.click(screen.getByTestId('false-positive-toggle'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('is disabled while loading (initial fetch)', () => {
    render(<FalsePositiveToggle {...baseProps({ loading: true })} />);
    expect(screen.getByTestId('false-positive-toggle')).toBeDisabled();
  });

  it('is disabled while saving (write in flight)', () => {
    render(<FalsePositiveToggle {...baseProps({ saving: true })} />);
    expect(screen.getByTestId('false-positive-toggle')).toBeDisabled();
  });

  it('renders the error region with role=alert only when an error is present', () => {
    const { rerender } = render(<FalsePositiveToggle {...baseProps()} />);
    expect(screen.queryByTestId('false-positive-error')).toBeNull();

    rerender(
      <FalsePositiveToggle {...baseProps({ error: new Error('boom') })} />,
    );
    const alert = screen.getByTestId('false-positive-error');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent('오류가 발생했습니다');
  });
});
