import * as React from 'react';
import { AppShell } from '@/components/app-shell/AppShell';

export default function AuditLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
