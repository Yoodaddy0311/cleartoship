// W2.C5.2 — usePersistentChecklist hook tests.
//
// Each test starts with a clean window.localStorage and a freshly-mocked timer
// surface (vi.restoreAllMocks). Three behaviour pillars:
//   1. Initial state is empty when storage has no payload.
//   2. setItem(id, value) persists the toggle and survives the next render.
//   3. clearAll() wipes both in-memory state AND the underlying storage row.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { usePersistentChecklist } = await import('./use-persistent-checklist.js');

const STORAGE_KEY = 'audit-abc-123';
const FULL_KEY = `cts.checklist.${STORAGE_KEY}`;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('usePersistentChecklist', () => {
  it('starts with an empty state when localStorage has no stored value', () => {
    const { result } = renderHook(() => usePersistentChecklist(STORAGE_KEY));
    // First element is the state map — should be {} on a fresh mount.
    expect(result.current[0]).toEqual({});
    // No write should have happened yet either.
    expect(window.localStorage.getItem(FULL_KEY)).toBeNull();
  });

  it('setItem persists the toggle and is observable on next render', () => {
    const { result } = renderHook(() => usePersistentChecklist(STORAGE_KEY));

    act(() => {
      result.current[1]('finding-1', true);
    });
    expect(result.current[0]).toEqual({ 'finding-1': true });

    act(() => {
      result.current[1]('finding-2', true);
    });
    expect(result.current[0]).toEqual({ 'finding-1': true, 'finding-2': true });

    // Storage row reflects the latest snapshot (used to survive a reload).
    const raw = window.localStorage.getItem(FULL_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({
      'finding-1': true,
      'finding-2': true,
    });

    // Untoggle should also persist (false is a legitimate, distinct value).
    act(() => {
      result.current[1]('finding-1', false);
    });
    expect(result.current[0]).toEqual({ 'finding-1': false, 'finding-2': true });
    expect(JSON.parse(window.localStorage.getItem(FULL_KEY) as string)).toEqual({
      'finding-1': false,
      'finding-2': true,
    });
  });

  it('clearAll wipes in-memory state AND the underlying storage row', () => {
    // Pre-seed storage so we know `clearAll` removes the row (not just the
    // in-memory copy). Simulates a returning user.
    window.localStorage.setItem(
      FULL_KEY,
      JSON.stringify({ 'finding-1': true, 'finding-2': true }),
    );

    const { result } = renderHook(() => usePersistentChecklist(STORAGE_KEY));

    // useEffect already hydrated from storage.
    expect(result.current[0]).toEqual({
      'finding-1': true,
      'finding-2': true,
    });

    act(() => {
      result.current[2]();
    });

    expect(result.current[0]).toEqual({});
    expect(window.localStorage.getItem(FULL_KEY)).toBeNull();
  });
});
