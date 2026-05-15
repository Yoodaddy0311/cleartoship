/**
 * Type shim for `geist/font/mono`.
 *
 * The runtime depends on the optional `geist` package; the app already guards
 * against it being missing at runtime (see `app/layout.tsx`). This module
 * declaration keeps `tsc --noEmit` green even when the package isn't installed.
 *
 * Remove this file once `geist` is added as a real dependency.
 */
declare module 'geist/font/mono' {
  export const GeistMono: {
    variable: string;
    className: string;
    style: { fontFamily: string };
  };
}
