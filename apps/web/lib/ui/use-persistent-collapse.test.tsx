// usePersistentCollapse hook tests.
//
// Storage is mocked per test (no real `window.localStorage` writes leak across
// tests). The "no SSR mismatch" case relies on the hook returning the same
// `defaultCollapsed` synchronously on the first render — the effect that
// reads localStorage runs AFTER the initial render, so a server-rendered
// HTML string would be identical to the first client render.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { usePersistentCollapse } = await import('./use-persistent-collapse.js');

const KEY = 'cts.evidence.collapsed.test-rule';

beforeEach(() => {
  // jsdom ships a real localStorage — clear it so each test starts blank.
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('usePersistentCollapse', () => {
  it('starts collapsed=defaultCollapsed when localStorage has no stored value', () => {
    const { result } = renderHook(() => usePersistentCollapse(KEY, true));
    expect(result.current[0]).toBe(true);

    const { result: result2 } = renderHook(() =>
      usePersistentCollapse('cts.evidence.collapsed.other', false),
    );
    expect(result2.current[0]).toBe(false);
  });

  it('hydrates from localStorage on mount (persisted across reload)', () => {
    // Simulate a previous session that left the panel expanded.
    window.localStorage.setItem(KEY, '0');

    const { result } = renderHook(() => usePersistentCollapse(KEY, true));

    // useEffect ran synchronously inside renderHook → hydrated value wins.
    expect(result.current[0]).toBe(false);
  });

  it('toggle() flips state AND writes the new value to localStorage', () => {
    const { result } = renderHook(() => usePersistentCollapse(KEY, true));
    expect(result.current[0]).toBe(true);
    expect(window.localStorage.getItem(KEY)).toBeNull();

    act(() => {
      result.current[1]();
    });
    expect(result.current[0]).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBe('0');

    act(() => {
      result.current[1]();
    });
    expect(result.current[0]).toBe(true);
    expect(window.localStorage.getItem(KEY)).toBe('1');
  });

  it('does not crash and keeps in-memory state when localStorage is unavailable (private mode)', () => {
    // Make every storage access throw — Safari private mode behaviour.
    const throwingStore = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
      clear: () => {
        throw new Error('SecurityError');
      },
      key: () => null,
      get length() {
        return 0;
      },
    } as unknown as Storage;

    const localStorageSpy = vi
      .spyOn(window, 'localStorage', 'get')
      .mockReturnValue(throwingStore);

    const { result } = renderHook(() => usePersistentCollapse(KEY, true));
    // Reads must not propagate the error — initial value stays at default.
    expect(result.current[0]).toBe(true);

    // Writes must not propagate either — the UI flip still happens.
    act(() => {
      result.current[1]();
    });
    expect(result.current[0]).toBe(false);

    localStorageSpy.mockRestore();
  });
});
