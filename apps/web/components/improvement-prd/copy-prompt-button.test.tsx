// CopyPromptButton tests — sibling-located on purpose.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@cleartoship/ui', () => ({
  Button: ({
    children,
    onClick,
    leadingIcon,
    type,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    leadingIcon?: React.ReactNode;
    type?: 'button' | 'submit' | 'reset';
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type={type ?? 'button'} onClick={onClick} {...rest}>
      {leadingIcon}
      {children}
    </button>
  ),
}));

vi.mock('lucide-react', () => ({
  ClipboardCopy: () => <span data-testid="copy-icon" />,
  Check: () => <span data-testid="check-icon" />,
}));

vi.mock('@/lib/i18n', () => ({
  t: (k: string) => k,
}));

const { CopyPromptButton } = await import('./copy-prompt-button.js');

describe('CopyPromptButton', () => {
  let writeTextSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextSpy },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the copy label initially', () => {
    render(<CopyPromptButton markdown="# Hi" />);
    expect(
      screen.getByRole('button', { name: /prd\.copyPrompt/ })
    ).toBeInTheDocument();
  });

  it('writes the markdown to the clipboard when clicked', async () => {
    render(<CopyPromptButton markdown={'# Hello\n\nBody copy here.'} />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalledTimes(1);
    });
    expect(writeTextSpy).toHaveBeenCalledWith('# Hello\n\nBody copy here.');
  });

  it('shows the copied label and exposes aria-live=polite for screen readers', async () => {
    render(<CopyPromptButton markdown="payload" />);
    const button = screen.getByRole('button');

    expect(button).toHaveAttribute('aria-live', 'polite');

    fireEvent.click(button);

    expect(
      await screen.findByRole('button', { name: /prd\.copied/ })
    ).toBeInTheDocument();
  });
});
