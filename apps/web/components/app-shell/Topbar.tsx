'use client';

import * as React from 'react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface TopbarProps {
  breadcrumbs?: BreadcrumbItem[];
  title?: string;
  actions?: React.ReactNode;
}

export function Topbar({ breadcrumbs, title, actions }: TopbarProps) {
  return (
    <header
      className="flex h-14 items-center justify-between gap-3 border-b px-8"
      style={{
        background: 'var(--app-bg)',
        borderColor: 'var(--app-border)',
      }}
      data-testid="topbar"
    >
      <div className="flex min-w-0 items-center gap-2">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav aria-label="breadcrumb" className="flex items-center gap-1.5 text-sm">
            {breadcrumbs.map((b, i) => (
              <React.Fragment key={`${b.label}-${i}`}>
                {i > 0 ? (
                  <span
                    aria-hidden="true"
                    style={{ color: 'var(--app-fg-muted)' }}
                  >
                    /
                  </span>
                ) : null}
                {b.href ? (
                  <a
                    href={b.href}
                    className="hover:underline"
                    style={{ color: 'var(--app-fg-muted)' }}
                  >
                    {b.label}
                  </a>
                ) : (
                  <span style={{ color: 'var(--app-fg)' }}>{b.label}</span>
                )}
              </React.Fragment>
            ))}
          </nav>
        ) : title ? (
          <h1
            className="truncate text-sm font-semibold"
            style={{ color: 'var(--app-fg)' }}
          >
            {title}
          </h1>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
