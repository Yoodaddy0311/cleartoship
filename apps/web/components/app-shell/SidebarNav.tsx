'use client';

import * as React from 'react';
import Link from 'next/link';

export interface SidebarNavItem {
  href: string;
  label: string;
  icon?: React.ReactNode;
}

export interface SidebarNavProps {
  items: SidebarNavItem[];
  activeHref?: string;
}

export function SidebarNav({ items, activeHref }: SidebarNavProps) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const isActive = activeHref === item.href;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              data-active={isActive || undefined}
              className="relative flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm transition-colors hover:bg-[rgba(255,255,255,0.06)] focus-visible:bg-[rgba(255,255,255,0.06)] focus-visible:outline-none data-[active]:bg-[rgba(255,255,255,0.06)]"
              style={{
                color: isActive
                  ? 'var(--app-sidebar-active)'
                  : 'var(--app-sidebar-fg)',
              }}
            >
              {isActive ? (
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r"
                  style={{ background: 'var(--app-sidebar-active)' }}
                />
              ) : null}
              {item.icon ? (
                <span aria-hidden="true" className="inline-flex h-4 w-4 items-center">
                  {item.icon}
                </span>
              ) : null}
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
