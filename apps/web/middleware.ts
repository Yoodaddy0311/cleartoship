import { NextResponse, type NextRequest } from 'next/server';

/**
 * Sprint 0 middleware — placeholder.
 * - Sets Korean locale header for downstream consumers.
 * - Adds basic security headers.
 * - Auth gate is intentionally NOT enforced (anonymous audits allowed per PRD §2.3).
 */
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set('x-ct-locale', 'ko-KR');
  res.headers.set('x-content-type-options', 'nosniff');
  res.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts/).*)'],
};
