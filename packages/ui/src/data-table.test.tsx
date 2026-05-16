/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataTable } from './data-table';

const columns = [
  { key: 'name', header: 'Name', sortable: true },
  { key: 'count', header: 'Count', align: 'right' as const },
];

const rows = [
  { name: 'Alice', count: 3 },
  { name: 'Bob', count: 7 },
];

describe('DataTable', () => {
  it('renders one header per column and one row per record', () => {
    render(<DataTable columns={columns} rows={rows} />);
    expect(screen.getByRole('columnheader', { name: /Name/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Count/ })).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('renders an empty message when there are no rows', () => {
    render(<DataTable columns={columns} rows={[]} emptyMessage="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('fires onSort when a sortable column header is clicked', () => {
    const onSort = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={rows}
        sortKey="name"
        sortDirection="asc"
        onSort={onSort}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(onSort).toHaveBeenCalledWith('name');
  });

  it('exposes WCAG-compliant focus-visible outline on sortable headers', () => {
    render(<DataTable columns={columns} rows={rows} onSort={() => {}} />);
    const btn = screen.getByRole('button', { name: /Name/ });
    expect(btn.className).toMatch(/focus-visible:outline-2/);
    expect(btn.className).toMatch(/focus-visible:outline-\[color:var\(--mk-accent\)\]/);
  });
});
