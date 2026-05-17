// DownloadMarkdownButton tests — sibling-located on purpose.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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
  Download: () => <span data-testid="download-icon" />,
}));

const { DownloadMarkdownButton } = await import('./download-button.js');

describe('DownloadMarkdownButton', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let createSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let revokeSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let clickSpy: any;

  beforeEach(() => {
    createSpy = vi.fn(() => 'blob:mock-url');
    revokeSpy = vi.fn();
    // jsdom doesn't ship URL.createObjectURL — define it for the test.
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createSpy,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeSpy,
    });
    // Stub anchor.click so jsdom doesn't try to navigate.
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    clickSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('renders the provided label', () => {
    render(
      <DownloadMarkdownButton
        filename="improvement-prd-abc.md"
        markdown="# title"
        label="Download Markdown"
      />
    );
    expect(
      screen.getByRole('button', { name: /Download Markdown/i })
    ).toBeInTheDocument();
  });

  it('creates a Blob URL and triggers a download with the given filename on click', () => {
    render(
      <DownloadMarkdownButton
        filename="improvement-prd-abc.md"
        markdown={'# title\n\nBody'}
        label="Download Markdown"
      />
    );

    // Capture the anchor that gets appended to the DOM during click.
    let capturedAnchor: HTMLAnchorElement | null = null;
    const originalAppend = document.body.appendChild.bind(document.body);
    const appendSpy = vi
      .spyOn(document.body, 'appendChild')
      .mockImplementation(((node: Node) => {
        if (node instanceof HTMLAnchorElement) capturedAnchor = node;
        return originalAppend(node);
      }) as typeof document.body.appendChild);

    fireEvent.click(screen.getByRole('button', { name: /Download Markdown/i }));

    expect(createSpy).toHaveBeenCalledTimes(1);
    const blobArg = createSpy.mock.calls[0]?.[0] as Blob;
    expect(blobArg).toBeInstanceOf(Blob);
    expect(blobArg.type).toMatch(/text\/markdown/);

    expect(capturedAnchor).not.toBeNull();
    expect(capturedAnchor!.getAttribute('download')).toBe('improvement-prd-abc.md');
    expect(capturedAnchor!.href).toContain('blob:mock-url');
    expect(clickSpy).toHaveBeenCalledTimes(1);

    appendSpy.mockRestore();
  });
});
