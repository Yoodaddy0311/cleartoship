// Global error boundary tests — sibling-located on purpose.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/lib/i18n', () => ({
  t: (key: string) => key,
}));

vi.mock('@cleartoship/ui', () => ({
  Button: ({
    children,
    onClick,
    'aria-expanded': ariaExpanded,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    'aria-expanded'?: boolean;
  }) => (
    <button type="button" onClick={onClick} aria-expanded={ariaExpanded}>
      {children}
    </button>
  ),
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

const { default: GlobalError } = await import('./error.js');

describe('GlobalError', () => {
  it('renders the error title via i18n key', () => {
    render(<GlobalError error={new Error('boom')} reset={() => {}} />);
    expect(
      screen.getByRole('heading', { name: 'common.error' }),
    ).toBeInTheDocument();
  });

  it('invokes reset when the retry button is clicked', () => {
    const reset = vi.fn();
    render(<GlobalError error={new Error('boom')} reset={reset} />);
    fireEvent.click(screen.getByText('common.retry'));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('toggles the technical details panel', () => {
    render(<GlobalError error={Object.assign(new Error('boom'), { digest: 'abc' })} reset={() => {}} />);
    const toggle = screen.getByText('기술 정보 보기');
    expect(screen.queryByText(/Digest: abc/)).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText(/Digest: abc/)).toBeInTheDocument();
  });
});
