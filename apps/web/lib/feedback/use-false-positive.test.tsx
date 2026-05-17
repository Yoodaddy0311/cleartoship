// useFalsePositive hook tests — React state + Firestore API integration.
//
// We mock the anonymous-auth hook (uid is required for writes) and inject a
// fake api implementation so no network or SDK code runs during the test.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type {
  readFalsePositive,
  markFalsePositive,
  unmarkFalsePositive,
} from './false-positive';

vi.mock('@/lib/firebase/auth-init', () => ({
  useEnsureAnonymousAuth: () => ({
    user: { uid: 'uid-test' },
    uid: 'uid-test',
    initializing: false,
    error: null,
  }),
}));

const { useFalsePositive } = await import('./use-false-positive.js');

interface FakeApi {
  read: typeof readFalsePositive;
  mark: typeof markFalsePositive;
  unmark: typeof unmarkFalsePositive;
}

function makeApi(initial: boolean = false): FakeApi & {
  read: ReturnType<typeof vi.fn>;
  mark: ReturnType<typeof vi.fn>;
  unmark: ReturnType<typeof vi.fn>;
} {
  return {
    read: vi.fn().mockResolvedValue({ isFalsePositive: initial, markedAt: null }),
    mark: vi.fn().mockResolvedValue(undefined),
    unmark: vi.fn().mockResolvedValue(undefined),
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useFalsePositive', () => {
  it('starts in loading state and hydrates with the persisted flag (persistence on mount)', async () => {
    const api = makeApi(true);
    const { result } = renderHook(() =>
      useFalsePositive('run-1', 'find-1', { api }),
    );

    expect(result.current.loading).toBe(true);
    expect(result.current.isFalsePositive).toBe(false);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.read).toHaveBeenCalledWith('run-1', 'find-1', undefined);
    expect(result.current.isFalsePositive).toBe(true);
  });

  it('optimistic flip on toggle: state updates before Firestore resolves', async () => {
    const api = makeApi(false);
    let resolveMark: (() => void) | undefined;
    api.mark.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveMark = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useFalsePositive('run-1', 'find-1', { api }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      void result.current.toggle();
    });
    expect(result.current.saving).toBe(true);
    expect(result.current.isFalsePositive).toBe(true);

    act(() => {
      resolveMark?.();
    });
    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(api.mark).toHaveBeenCalledWith('run-1', 'find-1', 'uid-test', undefined);
  });

  it('rolls back the optimistic flip when the write fails', async () => {
    const api = makeApi(false);
    api.mark.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() =>
      useFalsePositive('run-1', 'find-1', { api }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggle();
    });

    expect(result.current.isFalsePositive).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('boom');
  });

  it('calls unmark when flipping from true → false', async () => {
    const api = makeApi(true);
    const { result } = renderHook(() =>
      useFalsePositive('run-1', 'find-1', { api }),
    );
    await waitFor(() => expect(result.current.isFalsePositive).toBe(true));

    await act(async () => {
      await result.current.toggle();
    });

    expect(api.unmark).toHaveBeenCalledWith('run-1', 'find-1', undefined);
    expect(api.mark).not.toHaveBeenCalled();
    expect(result.current.isFalsePositive).toBe(false);
  });

  it('ignores concurrent toggle clicks while a write is in flight', async () => {
    const api = makeApi(false);
    let resolveMark: (() => void) | undefined;
    api.mark.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveMark = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useFalsePositive('run-1', 'find-1', { api }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      void result.current.toggle();
    });
    act(() => {
      void result.current.toggle(); // should be a no-op while saving
    });
    expect(api.mark).toHaveBeenCalledTimes(1);

    act(() => {
      resolveMark?.();
    });
  });
});
