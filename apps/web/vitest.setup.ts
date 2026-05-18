import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// JSDOM does not implement IntersectionObserver, but motion/react's `useInView`
// (transitively used by SpecialText and any future scroll-driven component)
// instantiates one on mount. Provide a no-op stub so component tests can render
// without throwing. Tests that need real viewport intersection behaviour should
// still go through Playwright e2e.
if (typeof window !== 'undefined' && !('IntersectionObserver' in window)) {
  class IntersectionObserverStub {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = '';
    thresholds: ReadonlyArray<number> = [];
  }
  // @ts-expect-error — assigning a minimal stub to the global window type.
  window.IntersectionObserver = IntersectionObserverStub;
  // Mirror to global for libs that read globalThis directly.
  (globalThis as { IntersectionObserver: unknown }).IntersectionObserver =
    IntersectionObserverStub;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
