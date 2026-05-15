import { t } from '@/lib/i18n';

export type Severity = 'P0' | 'P1' | 'P2' | 'P3';

export const SEVERITY_ORDER: Severity[] = ['P0', 'P1', 'P2', 'P3'];

export function severityLabel(s: Severity): string {
  const key = `dashboard.severity.${s.toLowerCase()}` as const;
  // Cast — keys are statically known to exist in ko.ts
  return t(key as never);
}

/** Returns the CSS custom property name for the severity color. */
export function severityToken(s: Severity): string {
  return `var(--color-severity-${s.toLowerCase()})`;
}

/** Returns a Tailwind utility-compatible color name (theme-aware). */
export function severityClassBg(s: Severity): string {
  switch (s) {
    case 'P0':
      return 'bg-[color-mix(in_oklch,var(--color-severity-p0)_12%,transparent)] text-severity-p0';
    case 'P1':
      return 'bg-[color-mix(in_oklch,var(--color-severity-p1)_12%,transparent)] text-severity-p1';
    case 'P2':
      return 'bg-[color-mix(in_oklch,var(--color-severity-p2)_12%,transparent)] text-severity-p2';
    case 'P3':
      return 'bg-[color-mix(in_oklch,var(--color-severity-p3)_12%,transparent)] text-severity-p3';
  }
}
