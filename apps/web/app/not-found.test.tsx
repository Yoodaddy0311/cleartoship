// 404 page accessibility + composition tests — sibling-located on purpose.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/i18n', () => ({
  t: (key: string) => key,
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock('@cleartoship/ui', () => ({
  Button: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

const { default: NotFound } = await import('./not-found.js');

describe('NotFound (404)', () => {
  it('renders the 404 hero and a labelled section', () => {
    render(<NotFound />);
    expect(screen.getByText('404')).toBeInTheDocument();
    const region = screen.getByLabelText('common.notFound.title');
    expect(region.tagName).toBe('SECTION');
  });

  it('exposes a heading + description copy via i18n keys', () => {
    render(<NotFound />);
    expect(
      screen.getByRole('heading', { name: 'common.notFound.title' }),
    ).toBeInTheDocument();
    expect(screen.getByText('common.notFound.desc')).toBeInTheDocument();
  });

  it('renders a CTA that links back to the homepage', () => {
    render(<NotFound />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/');
    expect(link).toHaveTextContent('common.notFound.cta');
  });
});
