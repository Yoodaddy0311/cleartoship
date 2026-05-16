'use client';

import * as React from 'react';
import { cn } from './lib/cn';

export type DataTableAlign = 'left' | 'right' | 'center';
export type SortDirection = 'asc' | 'desc' | null;

export interface DataTableColumn {
  key: string;
  header: string;
  align?: DataTableAlign;
  sortable?: boolean;
  width?: string;
}

export interface DataTableProps {
  columns: DataTableColumn[];
  rows: Record<string, React.ReactNode>[];
  sortKey?: string;
  sortDirection?: SortDirection;
  onSort?: (key: string) => void;
  emptyMessage?: string;
  className?: string;
  caption?: string;
}

export function DataTable({
  columns,
  rows,
  sortKey,
  sortDirection,
  onSort,
  emptyMessage = 'No data',
  className,
  caption,
}: DataTableProps) {
  return (
    <div
      className={cn('w-full overflow-x-auto', className)}
      style={{
        background: 'var(--app-surface)',
        border: '1px solid var(--app-border)',
        borderRadius: 'var(--app-radius)',
      }}
    >
      <table className="w-full border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr style={{ borderBottom: '1px solid var(--app-border)' }}>
            {columns.map((col) => {
              const isSorted = sortKey === col.key && sortDirection !== null;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={
                    isSorted
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : col.sortable
                      ? 'none'
                      : undefined
                  }
                  className="px-4 py-2.5 text-[11px] font-medium uppercase"
                  style={{
                    color: 'var(--app-fg-muted)',
                    letterSpacing: '0.5px',
                    textAlign: col.align ?? 'left',
                    width: col.width,
                  }}
                >
                  {col.sortable && onSort ? (
                    <button
                      type="button"
                      onClick={() => onSort(col.key)}
                      className="inline-flex items-center gap-1 rounded-sm hover:underline focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--mk-accent)]"
                    >
                      {col.header}
                      {isSorted ? (
                        <span aria-hidden="true">
                          {sortDirection === 'asc' ? '▲' : '▼'}
                        </span>
                      ) : null}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-sm"
                style={{ color: 'var(--app-fg-muted)' }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="transition-colors"
                style={{ borderBottom: '1px solid var(--app-border)' }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    'var(--app-chip-bg)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className="px-4 py-3"
                    style={{
                      color: 'var(--app-fg)',
                      textAlign: col.align ?? 'left',
                    }}
                  >
                    {row[col.key] ?? null}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
