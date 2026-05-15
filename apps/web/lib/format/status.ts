import { t } from '@/lib/i18n';

/** 9 implementation statuses per 04_feature_graph_spec §5 */
export type ImplementationStatus =
  | 'complete'
  | 'partial'
  | 'ui_only'
  | 'logic_only'
  | 'missing_connection'
  | 'missing'
  | 'risky'
  | 'recommended'
  | 'unknown';

export const ALL_STATUSES: ImplementationStatus[] = [
  'complete',
  'partial',
  'ui_only',
  'logic_only',
  'missing_connection',
  'missing',
  'risky',
  'recommended',
  'unknown',
];

export function statusLabel(s: ImplementationStatus): string {
  return t(`status.${s}` as never);
}

/** Maps status to the CSS variable name from globals.css @theme */
export function statusVar(s: ImplementationStatus): string {
  const map: Record<ImplementationStatus, string> = {
    complete: 'var(--color-status-complete)',
    partial: 'var(--color-status-partial)',
    ui_only: 'var(--color-status-ui-only)',
    logic_only: 'var(--color-status-logic-only)',
    missing_connection: 'var(--color-status-missing-connection)',
    missing: 'var(--color-status-missing)',
    risky: 'var(--color-status-risky)',
    recommended: 'var(--color-status-recommended)',
    unknown: 'var(--color-status-unknown)',
  };
  return map[s];
}

/** Launch readiness 4-state */
export type LaunchStatus =
  | 'ready'
  | 'ready_with_improvements'
  | 'needs_work'
  | 'stop';

export function launchStatusLabel(s: LaunchStatus): string {
  const map: Record<LaunchStatus, string> = {
    ready: t('launch.ready'),
    ready_with_improvements: t('launch.readyWithImprovements'),
    needs_work: t('launch.needsWork'),
    stop: t('launch.stop'),
  };
  return map[s];
}

export function launchStatusToken(s: LaunchStatus): string {
  const map: Record<LaunchStatus, string> = {
    ready: 'var(--color-severity-p3)',
    ready_with_improvements: 'var(--color-severity-p2)',
    needs_work: 'var(--color-severity-p1)',
    stop: 'var(--color-severity-p0)',
  };
  return map[s];
}
