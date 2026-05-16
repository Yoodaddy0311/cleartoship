'use client';

import * as React from 'react';
import { Sidebar } from './Sidebar';

export interface AppShellProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
}

export function AppShell({ children, sidebar }: AppShellProps) {
  return (
    <div
      className="grid min-h-screen w-full"
      style={{
        gridTemplateColumns: '240px 1fr',
        background: 'var(--app-bg)',
        color: 'var(--app-fg)',
      }}
    >
      <aside className="row-span-full">
        {sidebar ?? <Sidebar />}
      </aside>
      <main className="flex min-h-screen flex-col">{children}</main>
    </div>
  );
}
