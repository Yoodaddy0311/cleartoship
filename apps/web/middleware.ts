import { NextResponse, type NextRequest } from 'next/server';

/**
 * Production-grade security headers middleware.
 * - Anonymous audits remain allowed (no auth gate) per PRD §2.3.
 * - CSP whitelists Firebase services, Pretendard CDN (jsdelivr), and emulator localhost.
 * - HSTS/strict CSP enabled only in production; dev keeps unsafe-eval for Next.js HMR.
 * - Per-request CSP nonce replaces blanket 'unsafe-inline' for script-src (sec-auditor P1-3).
 *   The nonce is forwarded to the React tree via the `x-nonce` request header so
 *   server components can read it (`headers().get('x-nonce')`) and attach to inline
 *   <script> tags. 'strict-dynamic' allows nonced scripts to load further scripts,
 *   while the host whitelist (https: + firebase/google hosts) serves as the fallback
 *   for older browsers that ignore 'strict-dynamic'.
 * - Applies to /api/* as well (see matcher below).
 */

const isProd = process.env.NODE_ENV === 'production';

/**
 * Generates a 128-bit random nonce, base64-encoded. Uses Web Crypto (available in
 * the Next.js Edge runtime) — no Node `crypto` import to keep middleware Edge-safe.
 */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // btoa is available in the Edge runtime.
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

// CSP directives. Order matters only for readability.
// - script-src: nonce-based + 'strict-dynamic' (modern), with host fallback for legacy UAs.
//   'unsafe-eval' is dev-only for Next.js HMR. 'unsafe-inline' is dropped — when a nonce
//   or 'strict-dynamic' is present, CSP3 browsers ignore 'unsafe-inline'.
// - style-src 'unsafe-inline' retained (Tailwind/Pretendard need it; styles are lower-risk).
// - connect-src includes Firebase REST/Realtime + emulator (localhost) for dev.
function buildCsp(nonce: string): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isProd ? [] : ["'unsafe-eval'"]),
    'https://*.firebaseapp.com',
    'https://*.googleapis.com',
    'https://apis.google.com',
    // Legacy fallback: browsers that don't understand 'strict-dynamic' will see
    // these and the host list above. Browsers that do understand it will ignore
    // host-source expressions, giving us strict nonce-only enforcement.
    "'unsafe-inline'",
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
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
    "style-src-elem 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
    "font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:",
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

  // Per-request CSP nonce. Forwarded to the React tree via a *request* header so
  // RSCs can read it via `next/headers`. Also echoed on the response for inspection.
  const nonce = generateNonce();

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);

  const res = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Echo nonce to the client (useful for debugging; not a security boundary).
  res.headers.set('x-nonce', nonce);

  // Downstream locale hint (existing behavior, preserved).
  res.headers.set('x-ct-locale', 'ko-KR');

  // Existing baseline (preserved).
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Content Security Policy — Firebase + Pretendard CDN + (dev) emulator.
  res.headers.set('Content-Security-Policy', buildCsp(nonce));

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
