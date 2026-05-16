import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Topbar } from './Topbar';

describe('Topbar', () => {
  it('renders breadcrumb items with separators', () => {
    render(
      <Topbar
        breadcrumbs={[
          { label: 'Audits', href: '/audits' },
          { label: 'Run 1' },
        ]}
      />
    );
    const nav = screen.getByRole('navigation', { name: 'breadcrumb' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Audits' })).toHaveAttribute(
      'href',
      '/audits'
    );
    expect(screen.getByText('Run 1')).toBeInTheDocument();
  });

  it('renders action slot content', () => {
    render(
      <Topbar
        title="Findings"
        actions={<button data-testid="action-btn">Run</button>}
      />
    );
    expect(screen.getByTestId('action-btn')).toHaveTextContent('Run');
  });
});
