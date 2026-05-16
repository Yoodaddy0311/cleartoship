'use client';

// Idle-time prefetch hook for the GraphCanvas dynamic chunk.
//
// Why this exists
// ───────────────
// `apps/web/app/audits/[id]/feature-graph/page.tsx` lazy-loads GraphCanvas via
// `next/dynamic({ ssr: false })` to keep ReactFlow out of the LCP critical path.
// That decision protects LCP but means the chunk is fetched only AFTER the user
// navigates to the feature-graph tab, adding a perceptible delay at tab-click time.
//
// This hook bridges the gap: it schedules the dynamic import during browser
// idle time on pages the user typically visits BEFORE the feature-graph tab
// (e.g. the dashboard). When the user finally clicks the tab, the JS chunk is
// already in the browser's module cache and the component renders instantly.
//
// Safety properties
// ─────────────────
// 1. SSR-safe — guarded by `typeof window` so it never runs during server render
// 2. LCP-safe  — uses `requestIdleCallback` (fallback `setTimeout(250)`) so the
//    fetch never competes with critical render work
// 3. Idempotent — JS module cache de-duplicates the dynamic import; calling
//    this from multiple pages is a no-op after the first fetch
// 4. Cancellable — returns a cleanup that cancels the idle callback if the
//    component unmounts before the browser becomes idle

import { useEffect } from 'react';

// `requestIdleCallback` / `cancelIdleCallback` are part of lib.dom but Safari
// historically lacked them; we feature-detect at runtime via the `in` operator
// to keep types honest while supporting the fallback path.
type IdleCallbackHandle = number;

/**
 * Prefetches the GraphCanvas dynamic chunk during browser idle time.
 *
 * Call this from any page that the user is likely to visit before the
 * feature-graph tab (most commonly the dashboard). Safe to call multiple
 * times — subsequent calls are no-ops thanks to the module cache.
 */
export function usePrefetchGraphCanvas(): void {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let idleHandle: IdleCallbackHandle | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const run = (): void => {
      // Webpack/Next will resolve the same chunk that next/dynamic uses in
      // feature-graph/page.tsx, so this populates the module cache exactly once.
      void import('@/components/feature-graph/graph-canvas');
    };

    if (typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(run, { timeout: 2000 });
    } else {
      // Fallback for Safari/older browsers without requestIdleCallback.
      // 250ms ≈ post-paint, well after FCP/LCP.
      timeoutHandle = setTimeout(run, 250);
    }

    return () => {
      if (
        idleHandle !== null &&
        typeof window.cancelIdleCallback === 'function'
      ) {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
      }
    };
  }, []);
}
