'use client';

// Wires the false-positive Firestore module into a React state hook.
//
// Persistence model: on mount we read the current value once. The toggle
// applies an optimistic local flip, then awaits the Firestore write — on
// failure we roll the flag back and surface an error so the UI can show a
// retry affordance. The component itself stays presentational.

import { useCallback, useEffect, useState } from 'react';
import { useEnsureAnonymousAuth } from '@/lib/firebase/auth-init';
import {
  markFalsePositive,
  readFalsePositive,
  unmarkFalsePositive,
  type FirestoreGetter,
} from './false-positive';

export interface UseFalsePositiveOptions {
  /** Test seam — lets a unit test substitute the Firestore singleton. */
  getDb?: FirestoreGetter;
  /** Test seam — bypass live Firestore reads/writes. */
  api?: {
    read: typeof readFalsePositive;
    mark: typeof markFalsePositive;
    unmark: typeof unmarkFalsePositive;
  };
}

export interface UseFalsePositiveResult {
  isFalsePositive: boolean;
  /** True while the initial GET is in flight — UI hides the toggle until done. */
  loading: boolean;
  /** True while a write is in flight — UI disables the toggle. */
  saving: boolean;
  error: Error | null;
  toggle: () => Promise<void>;
}

const DEFAULT_API = {
  read: readFalsePositive,
  mark: markFalsePositive,
  unmark: unmarkFalsePositive,
};

export function useFalsePositive(
  auditId: string,
  findingId: string,
  options: UseFalsePositiveOptions = {},
): UseFalsePositiveResult {
  const api = options.api ?? DEFAULT_API;
  const auth = useEnsureAnonymousAuth();

  const [isFalsePositive, setIsFalsePositive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Initial read — persistence so the flag survives a page reload.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .read(auditId, findingId, options.getDb)
      .then((res) => {
        if (cancelled) return;
        setIsFalsePositive(res.isFalsePositive);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [auditId, findingId, api, options.getDb]);

  const toggle = useCallback(async () => {
    if (saving) return;
    if (!auth.uid) {
      setError(new Error('Anonymous auth not ready'));
      return;
    }
    const next = !isFalsePositive;
    setSaving(true);
    setIsFalsePositive(next); // optimistic
    try {
      if (next) {
        await api.mark(auditId, findingId, auth.uid, options.getDb);
      } else {
        await api.unmark(auditId, findingId, options.getDb);
      }
      setError(null);
    } catch (err: unknown) {
      setIsFalsePositive(!next); // rollback
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setSaving(false);
    }
  }, [auditId, findingId, isFalsePositive, saving, auth.uid, api, options.getDb]);

  return { isFalsePositive, loading, saving, error, toggle };
}
