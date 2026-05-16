'use client';

import { useEffect, useState } from 'react';
import { ApiHttpError } from './client';

export type AuditResourceState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'pending'; runStatus: 'PENDING' | 'RUNNING' }
  | { status: 'failed'; runStatus: 'FAILED' | 'CANCELLED'; message?: string }
  | { status: 'unauthorized' }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

/**
 * Maps a thrown error from `apiFetch` (+ optional zod parse) into a discriminated
 * state. The page can then render a single switch over the result shape.
 *
 * `pendingPredicate` is invoked with the resolved value: if it returns true,
 * the resource is treated as "pending" (server returned 200 but the artifact
 * isn't ready yet — e.g. report still being generated).
 */
export function useAuditResource<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[]
): AuditResourceState<T> {
  const [state, setState] = useState<AuditResourceState<T>>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    fetcher()
      .then((data) => {
        if (cancelled) return;
        setState({ status: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiHttpError) {
          if (err.status === 401 || err.status === 403) {
            setState({ status: 'unauthorized' });
            return;
          }
          if (err.status === 404) {
            setState({ status: 'not-found' });
            return;
          }
          setState({ status: 'error', message: err.message });
          return;
        }
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : '데이터를 불러오지 못했습니다.',
        });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
