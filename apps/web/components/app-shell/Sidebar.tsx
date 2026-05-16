'use client';

import * as React from 'react';
import Link from 'next/link';
import { SidebarNav, type SidebarNavItem } from './SidebarNav';

export interface SidebarProps {
  brand?: string;
  items?: SidebarNavItem[];
  user?: { name: string; email?: string } | null;
  activeHref?: string;
}

const DEFAULT_ITEMS: SidebarNavItem[] = [
  { href: '/audits', label: '감사' },
  { href: '/audits/new', label: '새 감사' },
];

export function Sidebar({
  brand = 'ClearToShip',
  items = DEFAULT_ITEMS,
  user = null,
  activeHref,
}: SidebarProps) {
  return (
    <div
      className="flex h-full min-h-screen w-[240px] flex-col"
      style={{
        background: 'var(--app-sidebar-bg)',
        color: 'var(--app-sidebar-fg)',
      }}
      data-testid="sidebar"
    >
      <div className="flex h-14 items-center gap-2 px-5">
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-semibold"
          style={{ color: 'var(--app-sidebar-active)' }}
        >
          <span
            aria-hidden="true"
            className="inline-block h-6 w-6 rounded-md"
            style={{ background: 'var(--sev-p1, #C7CCD1)' }}
          />
          {brand}
        </Link>
      </div>
      <nav className="flex-1 px-3 py-2" aria-label="주 메뉴">
        <SidebarNav items={items} activeHref={activeHref} />
      </nav>
      {user ? (
        <div
          className="border-t px-4 py-3 text-xs"
          style={{ borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <div style={{ color: 'var(--app-sidebar-active)' }}>{user.name}</div>
          {user.email ? <div className="opacity-70">{user.email}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
