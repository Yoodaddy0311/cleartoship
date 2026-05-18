'use client';

import * as React from 'react';
import { Button } from '@cleartoship/ui';
import { RefreshCw } from 'lucide-react';
import {
  AUDIT_STEPS,
  type AuditStep,
} from '@cleartoship/shared-types';

const POLL_INTERVAL_MS = 2_000;
const POLL_BACKOFF_AFTER_MS = 30_000;
const POLL_BACKOFF_MS = 5_000;

// Per-step duration estimate (seconds). Conservative averages aligned with
// worker observability data — only used for ETA hints, never for gating logic.
// Keys are ordered to mirror AUDIT_STEPS for easier diff-review when new steps
// are added; the `Record<AuditStep, number>` type guarantees exhaustiveness so
// any missing key triggers a TS error at build time.
export const STEP_ETA_SEC: Readonly<Record<AuditStep, number>> = {
  VALIDATE_INPUT: 1,
  FETCH_REPO_METADATA: 2,
  CLONE_REPO: 8,
  ANALYZE_PROJECT_STRUCTURE: 3,
  ANALYZE_PRD: 2,
  DETECT_FEATURES: 4,
  RUN_STATIC_ANALYSIS: 25,
  DISCOVER_RISKY_FUNCTIONS: 6,
  RUN_DEPENDENCY_SCAN: 10,
  RUN_SECRET_SCAN: 5,
  ANALYZE_DATA_MODEL: 4,
  ANALYZE_DEPLOY_URL: 15,
  CHECK_DESIGN_CONSISTENCY: 8,
  ANALYZE_BUSINESS_READINESS: 3,
  GENERATE_FEATURE_GRAPH: 3,
  MAP_CHECKLIST: 2,
  CALCULATE_SCORES: 2,
  GENERATE_REPORT: 3,
  GENERATE_IMPROVEMENT_PRD: 4,
  CLEANUP: 1,
};

const COLD_START_BUDGET_SEC = 30;

function formatRemaining(sec: number): string {
  if (sec <= 0) return '곧';
  if (sec < 60) return `약 ${sec}초`;
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  if (rem === 0) return `약 ${mins}분`;
  return `약 ${mins}분 ${rem}초`;
}

/**
 * Estimate remaining seconds based on the current step and elapsed time.
 * Returns null when not enough signal to estimate (PENDING with no startedAt).
 *
 * Algorithm: sum STEP_ETA_SEC from the current step (inclusive) to the end.
 * If `currentStep` is null and we're in PENDING, attribute the cold-start
 * budget (~30s) so users see a non-empty ETA during worker spin-up.
 */
export function estimateRemainingSec(
  currentStep: AuditStep | null,
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED',
  startedAtIso: string | undefined,
  nowMs: number,
): number | null {
  if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED') {
    return null;
  }
  if (!currentStep) {
    // Cold start — no step yet. Show the cold-start budget.
    return COLD_START_BUDGET_SEC;
  }
  const idx = AUDIT_STEPS.indexOf(currentStep);
  if (idx < 0) return null;
  const remainingSteps = AUDIT_STEPS.slice(idx);
  let remainingSec = 0;
  for (const s of remainingSteps) remainingSec += STEP_ETA_SEC[s] ?? 5;

  // If we have startedAt, subtract elapsed time in the current step. We don't
  // know per-step start, so fall back to a coarse adjustment: cap remaining at
  // (totalBudget - elapsed) to prevent ETA from increasing as the user waits.
  if (startedAtIso) {
    const startedMs = Date.parse(startedAtIso);
    if (Number.isFinite(startedMs)) {
      const elapsedSec = Math.max(0, Math.floor((nowMs - startedMs) / 1000));
      const totalBudget = AUDIT_STEPS.reduce(
        (acc, s) => acc + (STEP_ETA_SEC[s] ?? 5),
        0,
      );
      const ceiling = Math.max(5, totalBudget - elapsedSec);
      remainingSec = Math.min(remainingSec, ceiling);
    }
  }
  return remainingSec;
}

/**
 * Compute the next poll delay (ms) from elapsed time, matching the polling
 * hook cadence (2s before 30s, 5s after). Pure helper for the countdown badge.
 */
export function nextPollDelayMs(elapsedSinceMountMs: number): number {
  return elapsedSinceMountMs > POLL_BACKOFF_AFTER_MS
    ? POLL_BACKOFF_MS
    : POLL_INTERVAL_MS;
}

export interface ColdStartMetaProps {
  currentStep: AuditStep | null;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  startedAtIso: string | undefined;
  /** Mount timestamp (epoch ms) — drives poll-cadence calc. */
  mountedAtMs: number;
  /** Called when user clicks the refresh button. */
  onManualRefresh: () => void;
  /** Override "now" for tests; defaults to Date.now(). */
  nowMs?: number;
}

/**
 * Renders the cold-start UX trio: ETA estimate, "next refresh in N s" hint,
 * and a manual refresh button. Static at the top of the progress screen so
 * users see something concrete during the ~30s worker spin-up.
 */
export function ColdStartMeta({
  currentStep,
  status,
  startedAtIso,
  mountedAtMs,
  onManualRefresh,
  nowMs,
}: ColdStartMetaProps): React.JSX.Element | null {
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED') {
      return undefined;
    }
    const handle = window.setInterval(() => setTick((t) => t + 1), 1_000);
    return () => window.clearInterval(handle);
  }, [status]);

  // Read tick so React re-renders on the interval — value itself is unused.
  void tick;

  const now = nowMs ?? Date.now();
  const remainingSec = estimateRemainingSec(currentStep, status, startedAtIso, now);
  const elapsedSinceMount = now - mountedAtMs;
  const pollDelayMs = nextPollDelayMs(elapsedSinceMount);
  const secsToNextPoll = Math.max(
    1,
    Math.ceil(pollDelayMs / 1000 - (elapsedSinceMount % pollDelayMs) / 1000),
  );

  if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED') {
    return null;
  }

  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-[color:var(--color-border-default)] bg-[color-mix(in_oklch,var(--color-bg-elevated)_60%,transparent)] px-3 py-2 text-sm"
      role="status"
      aria-live="polite"
    >
      {remainingSec !== null ? (
        <span className="text-[color:var(--color-fg-secondary)]">
          예상 완료 <strong>{formatRemaining(remainingSec)}</strong> 남음
        </span>
      ) : null}
      <span className="text-[color:var(--color-fg-muted)]" aria-hidden="true">·</span>
      <span className="text-[color:var(--color-fg-muted)]">
        약 {secsToNextPoll}초 후 자동 갱신
      </span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onManualRefresh}
        className="ml-auto"
        aria-label="진행 상태를 지금 새로고침"
      >
        <RefreshCw aria-hidden="true" className="mr-1 h-3.5 w-3.5" />
        새로고침
      </Button>
    </div>
  );
}
