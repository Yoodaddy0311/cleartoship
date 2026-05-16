// Header tests — sibling-located on purpose.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode;
    href: string;
    'aria-label'?: string;
  }) => (
    <a href={href} aria-label={ariaLabel}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/i18n', () => ({
  t: (k: string) => k,
}));

const { Header } = await import('./header.js');

describe('Header', () => {
  it('renders a skip-to-content link pointing at #main-content', () => {
    render(<Header />);
    const skip = screen.getByRole('link', { name: 'common.skipToMain' });
    expect(skip).toHaveAttribute('href', '#main-content');
  });

  it('renders the brand link with an a11y label', () => {
    render(<Header />);
    const brand = screen.getByRole('link', { name: 'app.brand' });
    expect(brand).toHaveAttribute('href', '/');
  });

  it('renders the primary navigation with a home link', () => {
    render(<Header />);
    const nav = screen.getByRole('navigation', { name: 'primary' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'nav.home' })).toHaveAttribute('href', '/');
  });
});
