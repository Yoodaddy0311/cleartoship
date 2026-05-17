'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiHttpError } from '@/lib/api/client';
import { getAuditRun, type AuditRunDto } from '@/lib/api/audit-runs';

interface PollingState {
  data: AuditRunDto | null;
  error: string | null;
  loading: boolean;
}

// SSR guard. Treat absence of `document` as "visible" so server-rendered
// effects (which won't run anyway) behave conservatively.
function isPageVisible(): boolean {
  if (typeof document === 'undefined') return true;
  return document.visibilityState !== 'hidden';
}

/**
 * Polls GET /api/audit-runs/:id every 2s; backs off to 5s after 30s of polling.
 * Stops on COMPLETED / FAILED / CANCELLED. Surfaces auth / not-found errors
 * directly to the caller rather than silently masking them with mock data.
 *
 * Background-tab pause (PERF-F4): when `document.visibilityState === 'hidden'`,
 * the loop suspends scheduling. When the tab becomes visible again, it fires
 * one immediate tick and resumes the regular cadence. Cadence/backoff logic
 * is preserved — only the scheduling gate changes.
 */
export function useAuditRunPolling(id: string): PollingState {
  const [state, setState] = useState<PollingState>({
    data: null,
    error: null,
    loading: true,
  });
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Set when we'd otherwise schedule the next tick but the tab is hidden.
    // The visibilitychange listener consults this to know whether to fire an
    // immediate resume tick.
    let pendingResume = false;
    // Latched once the loop reaches a terminal state (success or auth/404).
    // Prevents the visibilitychange handler from waking a stopped poller.
    let stopped = false;

    function scheduleNext(): void {
      if (cancelled || stopped) return;
      if (!isPageVisible()) {
        pendingResume = true;
        return;
      }
      const elapsed = Date.now() - startRef.current;
      const delay = elapsed > 30_000 ? 5_000 : 2_000;
      timer = setTimeout(tick, delay);
    }

    async function tick() {
      try {
        const run = await getAuditRun(id);
        if (cancelled) return;
        const dto: AuditRunDto = {
          id: run.id,
          status: run.status,
          currentStep: run.currentStep,
          progress: run.progress,
          enqueueMode: run.enqueueMode ?? null,
          // S6-03: schema parses `partialResultTools` as `string[]` (default
          // []), so this is always a real array — but we defensively guard
          // against unexpected shapes from any legacy data path.
          partialResultTools: Array.isArray(run.partialResultTools)
            ? run.partialResultTools
            : [],
          ...(run.startedAt ? { startedAt: run.startedAt } : {}),
          ...(run.completedAt ? { completedAt: run.completedAt } : {}),
          ...(run.errorMessage ? { errorMessage: run.errorMessage } : {}),
        };
        setState({ data: dto, error: null, loading: false });
        if (
          run.status === 'COMPLETED' ||
          run.status === 'FAILED' ||
          run.status === 'CANCELLED'
        ) {
          stopped = true;
          return;
        }
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiHttpError
            ? err.message
            : err instanceof Error
            ? err.message
            : '진행 상태를 가져오지 못했습니다.';
        setState((prev) => ({ ...prev, error: message, loading: false }));
        // Stop polling on terminal client errors (auth/not-found).
        if (err instanceof ApiHttpError && [401, 403, 404].includes(err.status)) {
          stopped = true;
          return;
        }
      }

      scheduleNext();
    }

    function handleVisibilityChange(): void {
      if (cancelled || stopped) return;
      if (isPageVisible() && pendingResume) {
        pendingResume = false;
        // Resume with an immediate fetch so the user sees fresh state the
        // moment they return to the tab, then `scheduleNext` resumes cadence.
        void tick();
      }
    }

    // First tick fires immediately on mount, regardless of visibility — the
    // caller mounted the hook expecting initial data. Subsequent scheduling
    // honours the visibility gate.
    void tick();

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [id]);

  return state;
}
