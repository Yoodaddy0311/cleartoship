import { NextResponse, type NextRequest } from 'next/server';

/**
 * Production-grade security headers middleware.
 * - Anonymous audits remain allowed (no auth gate) per PRD §2.3.
 * - CSP whitelists Firebase services, Pretendard CDN (jsdelivr), and emulator localhost.
 * - HSTS/strict CSP enabled only in production; dev keeps unsafe-eval for Next.js HMR.
 * - Applies to /api/* as well (see matcher below).
 */

const isProd = process.env.NODE_ENV === 'production';

// CSP directives. Order matters only for readability.
// - script-src: 'unsafe-eval' required by Next.js dev/HMR; dropped in production.
// - style-src 'unsafe-inline' required by Tailwind/Next inline styles and Pretendard.
// - connect-src includes Firebase REST/Realtime + emulator (localhost) for dev.
function buildCsp(): string {
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    ...(isProd ? [] : ["'unsafe-eval'"]),
    'https://*.firebaseapp.com',
    'https://*.googleapis.com',
    'https://apis.google.com',
  ].join(' ');

  const connectSrc = [
    "'self'",
    'https://*.googleapis.com',
    'https://*.firebaseio.com',
    'wss://*.firebaseio.com',
    'https://firestore.googleapis.com',
    'https://identitytoolkit.googleapis.com',
    'https://securetoken.googleapis.com',
    ...(isProd
      ? []
      : [
          'http://localhost:*',
          'http://127.0.0.1:*',
          'ws://localhost:*',
          'ws://127.0.0.1:*',
        ]),
  ].join(' ');

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "font-src 'self' https://cdn.jsdelivr.net data:",
    `connect-src ${connectSrc}`,
    "img-src 'self' data: blob: https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(isProd ? ['upgrade-insecure-requests'] : []),
  ];

  return directives.join('; ');
}

// CSRF defense: reject POST/PUT/PATCH/DELETE to /api/* whose Origin does not match Host.
// Same-origin requests from the SPA always send a matching Origin; cross-site forms do not.
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isCrossOriginApiRequest(req: NextRequest): boolean {
  if (!req.nextUrl.pathname.startsWith('/api/')) return false;
  if (!MUTATING_METHODS.has(req.method)) return false;

  const origin = req.headers.get('origin');
  // No Origin header on mutating same-origin requests is rare; allow only if Referer matches host.
  if (!origin) {
    const referer = req.headers.get('referer');
    const host = req.headers.get('host');
    if (!referer || !host) return true;
    try {
      return new URL(referer).host !== host;
    } catch {
      return true;
    }
  }

  const host = req.headers.get('host');
  if (!host) return true;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

export function middleware(req: NextRequest) {
  if (isCrossOriginApiRequest(req)) {
    return new NextResponse('Forbidden: cross-origin request rejected', {
      status: 403,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const res = NextResponse.next();

  // Downstream locale hint (existing behavior, preserved).
  res.headers.set('x-ct-locale', 'ko-KR');

  // Existing baseline (preserved).
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Content Security Policy — Firebase + Pretendard CDN + (dev) emulator.
  res.headers.set('Content-Security-Policy', buildCsp());

  // Clickjacking protection. frame-ancestors in CSP is the modern equivalent, kept for legacy UAs.
  res.headers.set('X-Frame-Options', 'DENY');

  // HSTS — production only to avoid pinning HTTPS on localhost.
  if (isProd) {
    res.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
  }

  // Disable powerful features we never use; opt out of FLoC/Topics.
  res.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  );

  res.headers.set('X-DNS-Prefetch-Control', 'on');

  return res;
}

export const config = {
  // Apply to all routes including /api/*, except Next internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts/).*)'],
};
