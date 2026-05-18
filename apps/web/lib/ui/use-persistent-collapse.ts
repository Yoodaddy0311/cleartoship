'use client';

// usePersistentCollapse — collapse/expand state that survives a page reload
// by persisting to localStorage under a caller-supplied key.
//
// SSR safety: Next.js renders this component on the server where
// `localStorage` is undefined, so we MUST NOT read from it during the initial
// render. We start with `defaultCollapsed` (the same value the server will
// emit), then sync from localStorage inside `useEffect` after hydration. This
// keeps the server HTML and the first client render identical — no React
// hydration mismatch warning.
//
// Storage failures (private mode, quota exceeded, blocked by the user) are
// swallowed silently and fall back to in-memory state. The toggle still
// flips for the current session; we just stop persisting.

import { useCallback, useEffect, useState } from 'react';

export type UsePersistentCollapseResult = readonly [
  collapsed: boolean,
  toggle: () => void,
];

/**
 * Returns a `[collapsed, toggle]` tuple whose value is persisted to
 * `localStorage` under `key`. The caller composes the full key, e.g.
 * `cts.evidence.collapsed.{ruleId}` — keeping the namespace decision at the
 * call site so we can reuse the hook for non-evidence sections later.
 *
 * @param key Full localStorage key. Treat empty string as "do not persist".
 * @param defaultCollapsed Initial value used during SSR and the first client
 *   render. Falls back to `true` (collapsed by default) so the panel takes
 *   minimum space on first paint.
 */
export function usePersistentCollapse(
  key: string,
  defaultCollapsed: boolean = true,
): UsePersistentCollapseResult {
  // Start with the deterministic default so SSR HTML matches the first
  // client render. `useEffect` below reconciles with localStorage.
  const [collapsed, setCollapsed] = useState<boolean>(defaultCollapsed);

  // Hydrate from localStorage on mount (and re-hydrate if `key` changes —
  // happens when the panel is re-keyed by a different ruleId).
  useEffect(() => {
    if (!key) return;
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const raw = window.localStorage.getItem(key);
      if (raw === null) return; // no stored value yet — keep default
      if (raw === '1' || raw === 'true') {
        setCollapsed(true);
      } else if (raw === '0' || raw === 'false') {
        setCollapsed(false);
      }
      // Any other value: silently ignore, keep current state. We never throw
      // from a UI hook over a malformed storage payload.
    } catch {
      // Access denied (Safari private mode, disabled cookies, etc.) — give up
      // and keep the in-memory default. Logging would just spam the console.
    }
  }, [key]);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      if (key) {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(key, next ? '1' : '0');
          }
        } catch {
          // Storage write failed — proceed with in-memory flip so the UI
          // remains responsive. Persistence is best-effort.
        }
      }
      return next;
    });
  }, [key]);

  return [collapsed, toggle] as const;
}
