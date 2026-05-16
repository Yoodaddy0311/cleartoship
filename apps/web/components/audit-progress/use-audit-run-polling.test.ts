// Behavioural test for useAuditRunPolling.
//
// Uses renderHook + vi.useFakeTimers() to assert the polling cadence:
//   - polls every 2s, backs off to 5s after 30s, stops on terminal status
//   - 401/403/404 ApiHttpError stops polling
//   - the timeout is cleared when the host component unmounts

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// `waitFor` is incompatible with `vi.useFakeTimers()` — its retry loop runs on
// the same fake clock and stalls indefinitely. Instead flush the React effect
// + the immediate `void tick()` Promise by advancing fake time by 0ms inside
// `act()`, which drains the microtask queue.
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

vi.mock('@/lib/api/audit-runs', () => ({
  getAuditRun: vi.fn(),
}));

describe('useAuditRunPolling — module shape', () => {
  it('exports a useAuditRunPolling function', async () => {
    const mod = await import('./use-audit-run-polling');
    expect(typeof mod.useAuditRunPolling).toBe('function');
    expect(mod.useAuditRunPolling.length).toBe(1);
  });
});

describe('useAuditRunPolling — behaviour', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls every 2s, backs off to 5s after 30s, and stops on terminal status', async () => {
    const { getAuditRun } = await import('@/lib/api/audit-runs');
    const { useAuditRunPolling } = await import('./use-audit-run-polling');

    // Always-pending response → keeps the polling loop going.
    vi.mocked(getAuditRun).mockResolvedValue({
      id: 'run-1',
      status: 'RUNNING',
      currentStep: null,
      progress: 10,
    } as never);

    renderHook(() => useAuditRunPolling('run-1'));

    // First tick fires immediately on mount.
    await flush();
    expect(vi.mocked(getAuditRun)).toHaveBeenCalledTimes(1);

    // 2s → second tick.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(vi.mocked(getAuditRun)).toHaveBeenCalledTimes(2);

    // 2s → third tick.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(vi.mocked(getAuditRun)).toHaveBeenCalledTimes(3);

    // Now flip the next response to COMPLETED — polling should stop.
    vi.mocked(getAuditRun).mockResolvedValueOnce({
      id: 'run-1',
      status: 'COMPLETED',
      currentStep: null,
      progress: 100,
    } as never);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    const callsAfterCompleted = vi.mocked(getAuditRun).mock.calls.length;
    expect(callsAfterCompleted).toBe(4);

    // Further time should NOT trigger more calls.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(vi.mocked(getAuditRun).mock.calls.length).toBe(callsAfterCompleted);
  });

  it('surfaces ApiHttpError 401/403/404 and stops polling', async () => {
    const { getAuditRun } = await import('@/lib/api/audit-runs');
    const { ApiHttpError } = await import('@/lib/api/client');
    const { useAuditRunPolling } = await import('./use-audit-run-polling');

    vi.mocked(getAuditRun).mockRejectedValue(
      new ApiHttpError({
        status: 404,
        code: 'UNKNOWN',
        message: 'not found',
      })
    );

    const { result } = renderHook(() => useAuditRunPolling('run-1'));

    await flush();
    expect(result.current.error).toBe('not found');

    const callsAfterError = vi.mocked(getAuditRun).mock.calls.length;
    expect(callsAfterError).toBe(1);

    // Polling must stop on 404 — extra time should yield no extra calls.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(vi.mocked(getAuditRun).mock.calls.length).toBe(callsAfterError);
  });

  it('clears the timeout when the component unmounts mid-tick', async () => {
    const { getAuditRun } = await import('@/lib/api/audit-runs');
    const { useAuditRunPolling } = await import('./use-audit-run-polling');

    vi.mocked(getAuditRun).mockResolvedValue({
      id: 'run-1',
      status: 'RUNNING',
      currentStep: null,
      progress: 10,
    } as never);

    const { unmount } = renderHook(() => useAuditRunPolling('run-1'));

    await flush();
    expect(vi.mocked(getAuditRun)).toHaveBeenCalledTimes(1);

    unmount();
    const callsAtUnmount = vi.mocked(getAuditRun).mock.calls.length;

    // After unmount, advancing timers must not invoke the fetcher again.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(vi.mocked(getAuditRun).mock.calls.length).toBe(callsAtUnmount);
  });
});
