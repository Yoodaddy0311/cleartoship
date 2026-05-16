import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { Sidebar } from './Sidebar';

describe('Sidebar', () => {
  it('renders the brand name and default nav items', () => {
    render(<Sidebar brand="TestBrand" />);
    expect(screen.getByText('TestBrand')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '주 메뉴' })).toBeInTheDocument();
  });

  it('renders user block when user prop is provided', () => {
    render(
      <Sidebar
        items={[{ href: '/x', label: 'X' }]}
        user={{ name: 'Alice', email: 'a@b.c' }}
      />
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('a@b.c')).toBeInTheDocument();
  });
});
