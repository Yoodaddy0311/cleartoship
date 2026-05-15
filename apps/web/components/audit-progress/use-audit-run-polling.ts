'use client';

import { useEffect, useRef, useState } from 'react';
import { AUDIT_STEPS } from '@cleartoship/shared-types';
import { getAuditRun, type AuditRunDto } from '@/lib/api/audit-runs';

interface PollingState {
  data: AuditRunDto | null;
  error: string | null;
  loading: boolean;
}

/**
 * Polls GET /api/audit-runs/:id every 2s; backs off to 5s after 30s of polling.
 * Stops on COMPLETED / FAILED / CANCELLED.
 *
 * Sprint 0 fallback: if the API doesn't exist, we feed a mock progression so
 * the UI is demoable without a backend.
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
    let mockStep = 0;

    async function tick() {
      try {
        const dto = await getAuditRun(id);
        if (cancelled) return;
        setState({ data: dto, error: null, loading: false });
        if (
          dto.status === 'COMPLETED' ||
          dto.status === 'FAILED' ||
          dto.status === 'CANCELLED'
        ) {
          return;
        }
      } catch {
        // Sprint 0 mock: synthesize progress so the UI is usable standalone.
        if (cancelled) return;
        const total = AUDIT_STEPS.length;
        mockStep = Math.min(mockStep + 1, total);
        const isDone = mockStep >= total;
        setState({
          data: {
            id,
            status: isDone ? 'COMPLETED' : 'RUNNING',
            currentStep:
              AUDIT_STEPS[Math.min(mockStep, total - 1)] ?? AUDIT_STEPS[0],
            progress: Math.round((mockStep / total) * 100),
          },
          error: null,
          loading: false,
        });
        if (isDone) return;
      }

      // Backoff after 30s of polling.
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
