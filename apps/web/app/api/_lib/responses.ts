// Shared API response helpers (used by all 7 route handlers).

import { NextResponse } from 'next/server';
import { type ErrorCode, makeError } from '@cleartoship/shared-types';

export function jsonError(
  code: ErrorCode,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(makeError(code, message, details), { status });
}

export function jsonOk<T extends Record<string, unknown>>(
  body: T,
  status = 200,
): NextResponse {
  return NextResponse.json(body, { status });
}

const ERROR_LOG_COMPONENT = 'api';
export function logServerError(route: string, err: unknown): void {
  const payload = {
    level: 'error',
    component: ERROR_LOG_COMPONENT,
    route,
    error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
  };
  process.stderr.write(JSON.stringify(payload) + '\n');
}
