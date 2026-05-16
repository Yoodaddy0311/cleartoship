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

import { AppShell } from './AppShell';

describe('AppShell', () => {
  it('renders children inside the main region', () => {
    render(
      <AppShell>
        <div data-testid="content">hello</div>
      </AppShell>
    );
    expect(screen.getByTestId('content')).toHaveTextContent('hello');
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('uses a custom sidebar slot when provided', () => {
    render(
      <AppShell sidebar={<aside data-testid="custom-sidebar">nav</aside>}>
        <span>body</span>
      </AppShell>
    );
    expect(screen.getByTestId('custom-sidebar')).toBeInTheDocument();
  });
});
