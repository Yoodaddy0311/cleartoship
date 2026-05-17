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

/**
 * Launch readiness state.
 *
 * - `ready` / `ready_with_improvements` / `needs_work` / `stop` are the four
 *   scored verdicts.
 * - `indeterminate` is a fifth, distinct state for runs where the coverage
 *   signal was too thin to produce a trustworthy score (worker scoring sets
 *   `launchStatus = 'INDETERMINATE'`). UI must avoid displaying the score as
 *   if it were a verdict; instead a "분석 표면 부족" banner is shown.
 * - `blocked` is a sixth state set when a T1.1 cost guardrail short-circuits
 *   the audit (e.g. repo too large). Worker writes `launchStatus = 'BLOCKED'`
 *   plus an `abortReason` code; UI surfaces a "가드레일 작동" banner.
 */
export type LaunchStatus =
  | 'ready'
  | 'ready_with_improvements'
  | 'needs_work'
  | 'stop'
  | 'indeterminate'
  | 'blocked';

export function launchStatusLabel(s: LaunchStatus): string {
  const map: Record<LaunchStatus, string> = {
    ready: t('launch.ready'),
    ready_with_improvements: t('launch.readyWithImprovements'),
    needs_work: t('launch.needsWork'),
    stop: t('launch.stop'),
    indeterminate: '판단 불가 (분석 자료 부족)',
    blocked: '감사 중단 (가드레일 작동)',
  };
  return map[s];
}

export function launchStatusToken(s: LaunchStatus): string {
  const map: Record<LaunchStatus, string> = {
    ready: 'var(--color-severity-p3)',
    ready_with_improvements: 'var(--color-severity-p2)',
    needs_work: 'var(--color-severity-p1)',
    stop: 'var(--color-severity-p0)',
    indeterminate: 'var(--color-fg-muted)',
    blocked: 'var(--color-severity-p0)',
  };
  return map[s];
}
