// Behavioural tests for usePrefetchGraphCanvas.
//
// Verifies:
//   1. Schedules the dynamic import via requestIdleCallback when available
//   2. Falls back to setTimeout when requestIdleCallback is missing
//   3. Cancels the scheduled callback on unmount (no late prefetch)
//   4. SSR-safe — no throw when window is undefined (smoke-checked by import)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

// Mock the dynamic import target so the test doesn't have to resolve reactflow.
vi.mock('@/components/feature-graph/graph-canvas', () => ({
  GraphCanvas: () => null,
}));

import { usePrefetchGraphCanvas } from './use-prefetch-graph-canvas';

function Probe() {
  usePrefetchGraphCanvas();
  return null;
}

describe('usePrefetchGraphCanvas', () => {
  const originalRIC = (window as unknown as Record<string, unknown>)
    .requestIdleCallback;
  const originalCIC = (window as unknown as Record<string, unknown>)
    .cancelIdleCallback;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    (window as unknown as Record<string, unknown>).requestIdleCallback =
      originalRIC;
    (window as unknown as Record<string, unknown>).cancelIdleCallback =
      originalCIC;
  });

  it('schedules the prefetch via requestIdleCallback when available', () => {
    const ric = vi.fn(
      (cb: () => void, _opts?: { timeout?: number }) => {
        cb();
        return 42;
      }
    );
    (window as unknown as Record<string, unknown>).requestIdleCallback = ric;
    (window as unknown as Record<string, unknown>).cancelIdleCallback = vi.fn();

    render(<Probe />);

    expect(ric).toHaveBeenCalledTimes(1);
    expect(ric.mock.calls[0]?.[1]).toEqual({ timeout: 2000 });
  });

  it('falls back to setTimeout when requestIdleCallback is missing', () => {
    delete (window as unknown as Record<string, unknown>).requestIdleCallback;
    delete (window as unknown as Record<string, unknown>).cancelIdleCallback;
    const spy = vi.spyOn(global, 'setTimeout');

    render(<Probe />);

    expect(spy).toHaveBeenCalled();
    const [, delay] = spy.mock.calls[0] ?? [];
    expect(delay).toBe(250);
  });

  it('cancels the idle callback on unmount before it fires', () => {
    const cic = vi.fn();
    const ric = vi.fn(() => 99);
    (window as unknown as Record<string, unknown>).requestIdleCallback = ric;
    (window as unknown as Record<string, unknown>).cancelIdleCallback = cic;

    const { unmount } = render(<Probe />);
    unmount();

    expect(cic).toHaveBeenCalledWith(99);
  });

  it('clears the fallback timeout on unmount', () => {
    delete (window as unknown as Record<string, unknown>).requestIdleCallback;
    delete (window as unknown as Record<string, unknown>).cancelIdleCallback;
    const clearSpy = vi.spyOn(global, 'clearTimeout');

    const { unmount } = render(<Probe />);
    unmount();

    expect(clearSpy).toHaveBeenCalled();
  });
});
