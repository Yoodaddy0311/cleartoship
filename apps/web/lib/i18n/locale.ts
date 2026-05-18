/**
 * Locale infrastructure for ko/en toggle (Sprint 4 L-P1-5).
 *
 * Locale resolution is cookie-driven so server components (which read the
 * cookie via `next/headers`) and client components (which read it via
 * `document.cookie`) agree on the active locale, avoiding hydration mismatch.
 *
 * The active locale is also injected as a React context on the client so
 * descendants can render without re-parsing the cookie on every render.
 */

export type Locale = 'ko' | 'en';

export const SUPPORTED_LOCALES: readonly Locale[] = ['ko', 'en'] as const;
export const DEFAULT_LOCALE: Locale = 'ko';
export const LOCALE_COOKIE_NAME = 'cts.locale';
// 1 year in seconds. Long-lived because the toggle is an explicit user choice.
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (SUPPORTED_LOCALES as ReadonlyArray<string>).includes(v);
}

/**
 * Normalize an unknown cookie value into a supported `Locale`. Falls back to
 * `DEFAULT_LOCALE` when the cookie is missing or malformed. Pure helper —
 * does NOT touch `next/headers`, so it can be exercised in unit tests.
 */
export function normalizeLocale(value: string | undefined | null): Locale {
  if (!value) return DEFAULT_LOCALE;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Server-side locale reader. Uses Next.js `cookies()` (which is async in
 * Next.js 15+). Returns `DEFAULT_LOCALE` when the cookie is absent or
 * carries a value outside the supported set.
 *
 * IMPORTANT: only call from a Server Component, Route Handler, or Server
 * Action context — Next.js will throw if called outside a request scope.
 */
export async function getLocale(): Promise<Locale> {
  // Lazy import keeps the module tree-shakable for client bundles that only
  // need the pure helpers above.
  const { cookies } = await import('next/headers');
  const store = await cookies();
  return normalizeLocale(store.get(LOCALE_COOKIE_NAME)?.value);
}

/**
 * Client-side locale reader. Parses `document.cookie` synchronously so it
 * runs during render. Returns `DEFAULT_LOCALE` outside the browser (SSR).
 *
 * For React trees prefer threading the locale through a Provider (see
 * `LocaleProvider` consumers) — this helper exists for top-level layout
 * boundaries where context is not yet available.
 */
export function getLocaleFromDocument(): Locale {
  if (typeof document === 'undefined') return DEFAULT_LOCALE;
  const raw = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${LOCALE_COOKIE_NAME}=`));
  if (!raw) return DEFAULT_LOCALE;
  const value = decodeURIComponent(raw.slice(LOCALE_COOKIE_NAME.length + 1));
  return normalizeLocale(value);
}

/**
 * Server-only locale writer. Sets the cookie on the outgoing response with
 * `SameSite=Lax` (so cross-origin navigations from the same site still carry
 * it) and a 1-year max-age. `Secure` is left to Next.js's defaults — local
 * dev over http otherwise drops the cookie.
 *
 * Throws when given an unsupported locale so callers cannot silently corrupt
 * the cookie.
 */
export async function setLocale(locale: Locale): Promise<void> {
  if (!isLocale(locale)) {
    throw new Error(`Unsupported locale: ${String(locale)}`);
  }
  const { cookies } = await import('next/headers');
  const store = await cookies();
  store.set(LOCALE_COOKIE_NAME, locale, {
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
    path: '/',
    httpOnly: false, // client needs to read it for hydration-stable rendering
  });
}
