/**
 * Typed fetch wrapper. Uses standard Response with JSON parsing.
 * Sprint 0: hits Next.js Route Handlers (`/api/...`). No external base URL.
 */
import {
  ErrorBodySchema,
  type ErrorCode,
} from '@cleartoship/shared-types';

export class ApiHttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode | 'UNKNOWN';
  readonly details: Record<string, unknown> | undefined;

  constructor(args: {
    status: number;
    code: ErrorCode | 'UNKNOWN';
    message: string;
    details?: Record<string, unknown>;
  }) {
    super(args.message);
    this.name = 'ApiHttpError';
    this.status = args.status;
    this.code = args.code;
    this.details = args.details;
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    let rawBody: unknown = undefined;
    try {
      rawBody = await res.json();
    } catch {
      // body not JSON — fall through to generic message
    }
    const parsed = ErrorBodySchema.safeParse(rawBody);
    if (parsed.success) {
      throw new ApiHttpError({
        status: res.status,
        code: parsed.data.error.code,
        message: parsed.data.error.message,
        details: parsed.data.error.details,
      });
    }
    throw new ApiHttpError({
      status: res.status,
      code: 'UNKNOWN',
      message: `요청 실패 (${res.status})`,
    });
  }

  // Allow 204 / empty body
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
