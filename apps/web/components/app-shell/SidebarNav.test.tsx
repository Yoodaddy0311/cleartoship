import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { SidebarNav } from './SidebarNav';

describe('SidebarNav', () => {
  const items = [
    { href: '/a', label: 'Alpha' },
    { href: '/b', label: 'Beta' },
  ];

  it('renders every nav item as a link', () => {
    render(<SidebarNav items={items} />);
    expect(screen.getByRole('link', { name: 'Alpha' })).toHaveAttribute('href', '/a');
    expect(screen.getByRole('link', { name: 'Beta' })).toHaveAttribute('href', '/b');
  });

  it('marks the active item with aria-current=page', () => {
    render(<SidebarNav items={items} activeHref="/b" />);
    expect(screen.getByRole('link', { name: 'Beta' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Alpha' })).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('renders the active accent bar as a 4px (w-1) element', () => {
    const { container } = render(
      <SidebarNav items={items} activeHref="/a" />
    );
    const bar = container.querySelector('span[aria-hidden="true"]');
    expect(bar).not.toBeNull();
    expect(bar?.className).toMatch(/(^|\s)w-1(\s|$)/);
    expect(bar?.className).not.toMatch(/w-\[3px\]/);
  });
});
