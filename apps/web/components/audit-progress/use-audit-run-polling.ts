'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiHttpError } from '@/lib/api/client';
import { getAuditRun, type AuditRunDto } from '@/lib/api/audit-runs';

interface PollingState {
  data: AuditRunDto | null;
  error: string | null;
  loading: boolean;
}

/**
 * Polls GET /api/audit-runs/:id every 2s; backs off to 5s after 30s of polling.
 * Stops on COMPLETED / FAILED / CANCELLED. Surfaces auth / not-found errors
 * directly to the caller rather than silently masking them with mock data.
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
          return;
        }
      }

      const elapsed = Date.now() - startRef.current;
      const delay = elapsed > 30_000 ? 5_000 : 2_000;
      timer = setTimeout(tick, delay);
    }

    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  return state;
}
