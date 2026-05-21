// Next.js Pages Router route extractor.
//
// `pages/**/*.tsx`-style routes:
//   - `pages/index.tsx`     → "/"
//   - `pages/about.tsx`     → "/about"
//   - `pages/users/[id].tsx`→ "/users/[id]"
//   - `pages/api/auth.ts`   → "/api/auth"  (API)
//
// Excluded special files:
//   - `_app`, `_document`, `_error`, `_middleware` — framework hooks, not routes
//   - `.test.*` / `.spec.*` — test files
//   - non-JS/TS extensions
//
// No file content scan — Pages Router doesn't have per-method exports the
// same way App Router does. `exportedMethods` stays undefined for pages and
// `[]` for API routes (consumer treats undefined as "n/a" and [] as "tried
// but found none").

import path from 'node:path';
import type { RouteEntry, RouteFramework } from '@cleartoship/shared-types';
import { hasKind, parseSegment, segmentsToUrlPath } from './segment-parser.js';

const PAGES_BOUNDARY = /(^|[\\/])pages[\\/]/;

const VALID_EXT = /\.(tsx|jsx|ts|js)$/i;
const SPECIAL_BASENAMES = new Set(['_app', '_document', '_error', '_middleware']);
const TEST_RE = /\.(test|spec)\.[^.]+$/i;

interface PagesFile {
  relPath: string;
  segments: string[];
  isApi: boolean;
}

/**
 * Pick files belonging to a Next.js Pages Router. Strips the path before
 * `pages/`, drops the extension, and explodes into segments. `index.<ext>`
 * collapses to the parent path. `pages/api/...` is flagged `isApi`.
 *
 * The boundary check uses the LAST `pages/` in the path so a deeply nested
 * monorepo (`apps/web/pages/...`) is picked correctly while a coincidental
 * `pages` directory inside `node_modules` is naturally excluded by the
 * caller's earlier tree pruning.
 */
export function pickPagesRouterFiles(
  fileTree: ReadonlyArray<string>
): PagesFile[] {
  const out: PagesFile[] = [];
  for (const rel of fileTree) {
    if (!PAGES_BOUNDARY.test(rel)) continue;
    if (!VALID_EXT.test(rel)) continue;
    if (TEST_RE.test(rel)) continue;

    const norm = rel.replace(/\\/g, '/');
    const padded = norm.startsWith('pages/') ? `/${norm}` : norm;
    const idx = padded.lastIndexOf('/pages/');
    if (idx < 0) continue;
    const afterPages = padded.slice(idx + '/pages/'.length);
    // Drop the extension from the last segment.
    const noExt = afterPages.replace(VALID_EXT, '');
    const parts = noExt.split('/').filter((p) => p.length > 0);

    if (parts.length === 0) continue; // shouldn't happen; defensive.

    // Skip Next.js special files (only the leaf — a directory called `_app`
    // is unusual but not a special).
    const leaf = parts[parts.length - 1];
    if (leaf && SPECIAL_BASENAMES.has(leaf)) continue;

    // `pages/index.tsx`  → segments [] (root)
    // `pages/about.tsx`  → segments [ 'about' ]
    // `pages/users/[id].tsx` → segments [ 'users', '[id]' ]
    const segments = parts.slice();
    if (segments[segments.length - 1] === 'index') {
      segments.pop();
    }

    const isApi = segments[0] === 'api';
    out.push({ relPath: rel, segments, isApi });
  }
  return out;
}

/**
 * Build Pages-Router RouteEntry[] from the file tree.
 */
export function extractPagesRouterRoutes(
  _clonePath: string,
  fileTree: ReadonlyArray<string>
): RouteEntry[] {
  // _clonePath kept in the signature for symmetry with the App Router extractor
  // even though we don't currently read file contents here.
  void path; // keep import for future content-reading expansion
  void _clonePath;

  const files = pickPagesRouterFiles(fileTree);
  const entries: RouteEntry[] = [];

  for (const f of files) {
    const segments = f.segments.map(parseSegment);
    // For Pages Router API routes the `/api` prefix is part of the URL path,
    // not a framework artifact — keep it.
    const urlPath = segmentsToUrlPath(segments);

    const framework: RouteFramework = f.isApi ? 'next-pages-api' : 'next-pages';
    const type: RouteEntry['type'] = f.isApi ? 'api' : 'page';

    const entry: RouteEntry = {
      urlPath,
      framework,
      type,
      sourceFile: f.relPath,
      segments,
      hasDynamic:
        hasKind(segments, 'dynamic') ||
        hasKind(segments, 'catchAll') ||
        hasKind(segments, 'optionalCatchAll'),
      hasCatchAll:
        hasKind(segments, 'catchAll') || hasKind(segments, 'optionalCatchAll'),
    };
    if (f.isApi) {
      // Pages Router API exports a default handler, not per-method functions.
      // We don't have a cheap way to enumerate methods without parsing the
      // body; leave empty for now (PR-A3b can add per-method detection via
      // ts-morph alongside the Express handler scanner).
      entry.exportedMethods = [];
    }
    entries.push(entry);
  }

  return entries;
}
