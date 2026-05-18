'use client';

// W2.C5.2 — usePersistentChecklist
// Per-item checked state for a "next-30-minutes" style checklist that has to
// survive a page reload. Mirrors the SSR-safe pattern used by
// `use-persistent-collapse`: start with an empty map on the first render so
// the server HTML and first client render match, then sync from localStorage
// inside `useEffect` to avoid React hydration warnings.
//
// Storage failures (Safari private mode, quota exceeded, disabled cookies)
// are swallowed silently — the UI keeps an in-memory copy so toggles still
// work for the current session; we just stop persisting.

import { useCallback, useEffect, useState } from 'react';

export type ChecklistState = Record<string, boolean>;

export type UsePersistentChecklistResult = readonly [
  state: ChecklistState,
  setItem: (id: string, value: boolean) => void,
  clearAll: () => void,
];

const KEY_PREFIX = 'cts.checklist.';

function fullKey(storageKey: string): string {
  return `${KEY_PREFIX}${storageKey}`;
}

function safeParse(raw: string | null): ChecklistState {
  if (raw === null) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const out: ChecklistState = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'boolean') out[k] = v;
    }
    return out;
  } catch {
    // Corrupt payload — treat as empty rather than crashing the UI.
    return {};
  }
}

/**
 * Returns `[state, setItem, clearAll]` where `state` is a `{id: checked}` map
 * persisted to `localStorage` under `cts.checklist.{storageKey}`.
 *
 * @param storageKey Caller-supplied namespace (e.g. an audit id). Empty string
 *   disables persistence entirely so the hook still functions for unit tests
 *   that don't want disk effects.
 */
export function usePersistentChecklist(
  storageKey: string,
): UsePersistentChecklistResult {
  // Always start empty so SSR HTML matches the first client render.
  const [state, setState] = useState<ChecklistState>({});

  // Re-hydrate when the namespace changes (e.g. user navigates to a different
  // audit). `storageKey === ''` opts out of persistence — we keep the current
  // in-memory state instead of clobbering it.
  useEffect(() => {
    if (!storageKey) return;
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const raw = window.localStorage.getItem(fullKey(storageKey));
      const next = safeParse(raw);
      // Replace rather than merge — the stored snapshot is authoritative.
      setState(next);
    } catch {
      // Storage read denied — keep the in-memory default.
    }
  }, [storageKey]);

  const persist = useCallback(
    (next: ChecklistState) => {
      if (!storageKey) return;
      try {
        if (typeof window === 'undefined' || !window.localStorage) return;
        window.localStorage.setItem(fullKey(storageKey), JSON.stringify(next));
      } catch {
        // Write failed (quota exceeded, private mode) — proceed with the
        // in-memory update so the UI stays responsive.
      }
    },
    [storageKey],
  );

  const setItem = useCallback(
    (id: string, value: boolean) => {
      setState((prev) => {
        const next = { ...prev, [id]: value };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const clearAll = useCallback(() => {
    setState(() => {
      const next: ChecklistState = {};
      if (storageKey) {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem(fullKey(storageKey));
          }
        } catch {
          // Removal failed — fall back to in-memory clear only.
        }
      }
      return next;
    });
  }, [storageKey]);

  return [state, setItem, clearAll] as const;
}
