// Next.js route segment parser — shared by app-router + pages-router.
//
// Takes a raw segment string ("[id]", "(marketing)", "[[...slug]]", "users")
// and returns a `RouteSegment` with the correct `kind`. Returns `null` for
// segments that should be dropped from the URL path entirely (App Router
// groups: `(marketing)`).

import type {
  RouteSegment,
  RouteSegmentKind,
} from '@cleartoship/shared-types';

const DYNAMIC = /^\[([^.\]]+)\]$/; //                       [id]
const CATCH_ALL = /^\[\.\.\.([^\]]+)\]$/; //                [...slug]
const OPTIONAL_CATCH_ALL = /^\[\[\.\.\.([^\]]+)\]\]$/; //   [[...slug]]
const GROUP = /^\(([^)]+)\)$/; //                           (marketing)

/**
 * Parse one segment. Returns:
 *   - null when the segment should be erased from the URL (App Router groups)
 *   - { kind: 'group', ... } when the caller wants to know about it anyway
 *     (handled per-caller; the app-router extractor drops groups before
 *     joining the URL)
 *
 * Bracket kinds are mutually exclusive — we check optional-catch-all FIRST
 * because `[[...x]]` also matches `[...x]` if we tested catch-all first.
 */
export function parseSegment(raw: string): RouteSegment {
  const optionalCatchAll = OPTIONAL_CATCH_ALL.exec(raw);
  if (optionalCatchAll) {
    return { name: optionalCatchAll[1] ?? '', kind: 'optionalCatchAll' };
  }
  const catchAll = CATCH_ALL.exec(raw);
  if (catchAll) {
    return { name: catchAll[1] ?? '', kind: 'catchAll' };
  }
  const dynamic = DYNAMIC.exec(raw);
  if (dynamic) {
    return { name: dynamic[1] ?? '', kind: 'dynamic' };
  }
  const group = GROUP.exec(raw);
  if (group) {
    return { name: group[1] ?? '', kind: 'group' };
  }
  return { name: raw, kind: 'static' };
}

/**
 * Build the URL path from segments. Groups are dropped; brackets are
 * preserved on dynamic / catch-all so the inventory consumer can render
 * "/users/[id]" verbatim.
 */
export function segmentsToUrlPath(segments: RouteSegment[]): string {
  const parts: string[] = [];
  for (const s of segments) {
    if (s.kind === 'group') continue;
    if (s.kind === 'dynamic') parts.push(`[${s.name}]`);
    else if (s.kind === 'catchAll') parts.push(`[...${s.name}]`);
    else if (s.kind === 'optionalCatchAll') parts.push(`[[...${s.name}]]`);
    else parts.push(s.name);
  }
  if (parts.length === 0) return '/';
  return `/${parts.join('/')}`;
}

/** Quick helpers reused by the inventory aggregator. */
export function hasKind(
  segments: RouteSegment[],
  kind: RouteSegmentKind
): boolean {
  return segments.some((s) => s.kind === kind);
}
