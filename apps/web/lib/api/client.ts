/**
 * Typed fetch wrapper. Uses standard Response with JSON parsing.
 * Sprint 0: hits Next.js Route Handlers (`/api/...`). No external base URL.
 */
import {
  ErrorBodySchema,
  type ErrorCode,
} from '@cleartoship/shared-types';
import { getIdToken } from '@/lib/firebase/auth-init';

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

export interface ApiFetchOptions extends RequestInit {
  /** Explicit auth token override. Falsy = use current Firebase user. */
  authToken?: string | null;
  /** Skip Authorization header injection entirely. */
  skipAuth?: boolean;
}

function hasAuthorizationHeader(headers: HeadersInit | undefined): boolean {
  if (!headers) return false;
  if (headers instanceof Headers) return headers.has('Authorization');
  if (Array.isArray(headers)) {
    return headers.some(([k]) => k.toLowerCase() === 'authorization');
  }
  return Object.keys(headers).some((k) => k.toLowerCase() === 'authorization');
}

export async function apiFetch<T>(
  path: string,
  init?: ApiFetchOptions
): Promise<T> {
  const { authToken, skipAuth, headers: initHeaders, ...rest } = init ?? {};

  let token: string | null = null;
  if (!skipAuth && !hasAuthorizationHeader(initHeaders)) {
    token = authToken ?? (await getIdToken());
  }

  const mergedHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(initHeaders as Record<string, string> | undefined),
  };
  if (token) mergedHeaders.Authorization = `Bearer ${token}`;

  const res = await fetch(path, {
    ...rest,
    headers: mergedHeaders,
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
