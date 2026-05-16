// @vitest-environment jsdom
//
// Unit tests for `useAuditResource` — a small hook that wraps a thrown error
// from `apiFetch` into a discriminated `AuditResourceState`. We mock the
// fetcher (the dependency) and assert state transitions, never the fetcher
// implementation. The file lives under lib/api so the default environment is
// `node`; we override per-file with the directive above.

import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAuditResource } from './use-audit-resource';
import { ApiHttpError } from './client';

function makeHttpError(status: number, message = `요청 실패 (${status})`) {
  return new ApiHttpError({ status, code: 'UNKNOWN', message });
}

describe('useAuditResource — initial state', () => {
  it('starts in loading state on first render', () => {
    const fetcher = vi.fn(() => new Promise<string>(() => {}));
    const { result } = renderHook(() => useAuditResource(fetcher, []));
    expect(result.current.status).toBe('loading');
  });

  it('invokes the fetcher exactly once when deps are stable', () => {
    const fetcher = vi.fn(() => new Promise<string>(() => {}));
    renderHook(() => useAuditResource(fetcher, ['stable']));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('useAuditResource — success path', () => {
  it('transitions to ready with data on resolve', async () => {
    const payload = { hello: 'world' };
    const fetcher = vi.fn(async () => payload);
    const { result } = renderHook(() => useAuditResource(fetcher, []));

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    if (result.current.status === 'ready') {
      expect(result.current.data).toEqual(payload);
    }
  });
});

describe('useAuditResource — error mapping', () => {
  it('maps 401 ApiHttpError to status=unauthorized', async () => {
    const fetcher = vi.fn(async () => {
      throw makeHttpError(401);
    });
    const { result } = renderHook(() => useAuditResource(fetcher, []));

    await waitFor(() => {
      expect(result.current.status).toBe('unauthorized');
    });
  });

  it('maps 403 ApiHttpError to status=unauthorized', async () => {
    const fetcher = vi.fn(async () => {
      throw makeHttpError(403);
    });
    const { result } = renderHook(() => useAuditResource(fetcher, []));

    await waitFor(() => {
      expect(result.current.status).toBe('unauthorized');
    });
  });

  it('maps 404 ApiHttpError to status=not-found', async () => {
    const fetcher = vi.fn(async () => {
      throw makeHttpError(404);
    });
    const { result } = renderHook(() => useAuditResource(fetcher, []));

    await waitFor(() => {
      expect(result.current.status).toBe('not-found');
    });
  });

  it('maps other ApiHttpError statuses to status=error with original message', async () => {
    const fetcher = vi.fn(async () => {
      throw makeHttpError(500, 'internal failure');
    });
    const { result } = renderHook(() => useAuditResource(fetcher, []));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    if (result.current.status === 'error') {
      expect(result.current.message).toBe('internal failure');
    }
  });

  it('maps a non-ApiHttpError Error to status=error using its message', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('network down');
    });
    const { result } = renderHook(() => useAuditResource(fetcher, []));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    if (result.current.status === 'error') {
      expect(result.current.message).toBe('network down');
    }
  });

  it('maps a non-Error thrown value to status=error with default Korean fallback', async () => {
    const fetcher = vi.fn(async () => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw 'oops-string';
    });
    const { result } = renderHook(() => useAuditResource(fetcher, []));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    if (result.current.status === 'error') {
      expect(result.current.message).toBe('데이터를 불러오지 못했습니다.');
    }
  });
});

describe('useAuditResource — dependency reactivity', () => {
  it('re-fetches when deps change', async () => {
    const fetcher = vi.fn(async () => 'v');
    const { rerender } = renderHook(
      ({ dep }: { dep: number }) => useAuditResource(fetcher, [dep]),
      { initialProps: { dep: 1 } }
    );
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
    rerender({ dep: 2 });
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });

  it('ignores a resolved value when component has unmounted before resolve', async () => {
    let resolveFn: ((v: string) => void) | undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFn = resolve;
        })
    );
    const { result, unmount } = renderHook(() => useAuditResource(fetcher, []));
    expect(result.current.status).toBe('loading');

    unmount();
    // Resolve after unmount — the cleanup cancelled flag should prevent state update.
    await act(async () => {
      resolveFn?.('late');
      await Promise.resolve();
    });
    // No assertion error / no React act warning is the desired behaviour;
    // the hook simply does not update state post-unmount.
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
