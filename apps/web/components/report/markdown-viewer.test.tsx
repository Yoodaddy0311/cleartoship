// MarkdownViewer tests — sibling-located on purpose.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@cleartoship/ui', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

const { MarkdownViewer } = await import('./markdown-viewer.js');

describe('MarkdownViewer', () => {
  it('renders GFM headings and paragraphs', () => {
    render(<MarkdownViewer markdown={'# Title\n\nBody copy here.'} />);
    expect(screen.getByRole('heading', { name: 'Title', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Body copy here.')).toBeInTheDocument();
  });

  it('renders external links with target=_blank and noopener rel', () => {
    render(<MarkdownViewer markdown={'[ext](https://example.com)'} />);
    const link = screen.getByRole('link', { name: 'ext' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('keeps internal links without target=_blank', () => {
    render(<MarkdownViewer markdown={'[home](/dashboard)'} />);
    const link = screen.getByRole('link', { name: 'home' });
    expect(link).not.toHaveAttribute('target');
  });

  it('strips raw HTML (skipHtml safe-by-default)', () => {
    render(
      <MarkdownViewer
        markdown={'## title\n\nsafe paragraph\n\n<script>alert(1)</script>'}
      />
    );
    expect(screen.getByText(/safe paragraph/)).toBeInTheDocument();
    expect(screen.queryByText(/alert\(1\)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/script/)).not.toBeInTheDocument();
  });
});
