// Next.js App Router route extractor.
//
// Treats any file matching `app/**/page.{tsx,jsx,ts,js}` as a UI page and
// `app/**/route.{ts,js}` as an API route. The directory chain BETWEEN the
// `app` folder and the page file forms the route segments — exactly the
// Next.js convention. Route groups `(marketing)` are dropped from the URL.
//
// Monorepo handling: any nested folder pair like `apps/<name>/app/...` or
// `packages/<name>/app/...` is recognised, not only the literal `app/` at
// the repo root. The first directory after the matched `app/` boundary
// becomes segment 0.
//
// `exportedMethods` for API routes: best-effort regex scan of the file
// for top-level `export <async>? function (GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)`.
// Returns the matched method names in source order. Errors reading the
// file degrade to `exportedMethods: []` (we still record the route).

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type { RouteEntry, RouteFramework } from '@cleartoship/shared-types';
import { hasKind, parseSegment, segmentsToUrlPath } from './segment-parser.js';

const APP_BOUNDARY = /(^|[\\/])app[\\/]/;

const PAGE_RE = /[\\/]page\.(tsx|jsx|ts|js)$/i;
const ROUTE_RE = /[\\/]route\.(ts|js)$/i;

const METHOD_EXPORT_RE =
  /export\s+(?:async\s+)?(?:function|const|let|var)\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g;

interface AppRouterFile {
  absPath: string;
  relPath: string;
  isApi: boolean;
}

/**
 * Filter the file tree to App Router page/route files. The repo paths are
 * relative to the clone root and use OS-specific separators after `path.join`,
 * so the matcher tolerates both `/` and `\`.
 */
export function pickAppRouterFiles(
  fileTree: ReadonlyArray<string>
): AppRouterFile[] {
  const out: AppRouterFile[] = [];
  for (const rel of fileTree) {
    if (!APP_BOUNDARY.test(rel)) continue;
    if (PAGE_RE.test(rel)) {
      out.push({ absPath: rel, relPath: rel, isApi: false });
    } else if (ROUTE_RE.test(rel)) {
      out.push({ absPath: rel, relPath: rel, isApi: true });
    }
  }
  return out;
}

/**
 * Slice the segments AFTER the last `app/` boundary in the path and BEFORE
 * the trailing `page.*` / `route.*` file. Returns the raw segment strings,
 * untouched (caller passes them to `parseSegment`).
 */
function extractSegmentStrings(relPath: string): string[] {
  // Normalise to forward slashes so the split is OS-independent.
  const norm = relPath.replace(/\\/g, '/');
  // Find the LAST occurrence of `/app/` so monorepos with multiple `app/`
  // folders (rare but possible — e.g. an `app/` package and an `apps/<x>/app/`)
  // pick the most specific. For a repo-root `app/`, this finds `^app/` via
  // the leading-slash insertion below.
  const padded = norm.startsWith('app/') ? `/${norm}` : norm;
  const lastAppIdx = padded.lastIndexOf('/app/');
  const afterApp = padded.slice(lastAppIdx + '/app/'.length);
  // Drop the trailing `page.*` / `route.*`.
  const parts = afterApp.split('/');
  parts.pop();
  return parts.filter((p) => p.length > 0);
}

async function readMethodsFromRouteFile(
  absPath: string,
  clonePath: string
): Promise<string[]> {
  try {
    const full = path.isAbsolute(absPath) ? absPath : path.join(clonePath, absPath);
    const text = await fsp.readFile(full, 'utf8');
    const found = new Set<string>();
    for (const m of text.matchAll(METHOD_EXPORT_RE)) {
      if (m[1]) found.add(m[1]);
    }
    return Array.from(found);
  } catch {
    return [];
  }
}

/**
 * Build App-Router RouteEntry[] from the cloned repo.
 *
 * @param clonePath - cloned repo root, used to resolve files for the
 *                    `exportedMethods` reader.
 * @param fileTree - relative paths under `clonePath` (the existing
 *                   `state.fileTree`).
 */
export async function extractAppRouterRoutes(
  clonePath: string,
  fileTree: ReadonlyArray<string>
): Promise<RouteEntry[]> {
  const files = pickAppRouterFiles(fileTree);
  const entries: RouteEntry[] = [];

  for (const f of files) {
    const segStrings = extractSegmentStrings(f.relPath);
    const segments = segStrings.map(parseSegment);
    const urlPath = segmentsToUrlPath(segments);

    const framework: RouteFramework = f.isApi ? 'next-app-api' : 'next-app';
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
      entry.exportedMethods = await readMethodsFromRouteFile(f.absPath, clonePath);
    }

    entries.push(entry);
  }

  return entries;
}
