// PrdViewer tests — sibling-located on purpose.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@cleartoship/ui', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  CardBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/report/markdown-viewer', () => ({
  MarkdownViewer: ({ markdown }: { markdown: string }) => (
    <div data-testid="md">{markdown}</div>
  ),
}));

const { PrdViewer } = await import('./prd-viewer.js');

describe('PrdViewer', () => {
  it('delegates rendering to MarkdownViewer', () => {
    render(<PrdViewer markdown={'# Hello\n\nBody'} />);
    expect(screen.getByTestId('md')).toHaveTextContent('# Hello');
  });

  it('passes the markdown prop through verbatim', () => {
    render(<PrdViewer markdown="raw markdown" />);
    expect(screen.getByTestId('md')).toHaveTextContent('raw markdown');
  });
});
