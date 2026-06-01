// Resolve an `import`/`require` specifier to a real repo-relative file path,
// using ONLY the known file set (no disk IO) so the function stays pure and
// deterministic. Mirrors Node/TypeScript module resolution at a lightweight,
// honest level: it tries the common source extensions and `/index.*`, and
// returns `null` on a miss rather than fabricating a target.
//
// Resolution ladder (highest-confidence first):
//   1. relative (`./`, `../`)               → join against the importer dir
//   2. tsconfig `paths` alias               → substitute each target pattern
//   3. tsconfig `baseUrl`                    → join bare specifier under baseUrl
//   4. default `@/*` → src/ then repo root   → only when paths is the default
//
// This is the highest-risk module in the feature graph, so the ladder is
// explicit and every rung is unit-tested. Anything unresolved → `null`.

import type { PathAliases } from './load-path-aliases.js';

/** Extensions tried, in order, when the specifier omits one. */
const TRY_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'] as const;

/** POSIX-style path join + `.`/`..` normalisation for repo-relative paths. */
function joinAndNormalize(...parts: string[]): string {
  const joined = parts.join('/').replace(/\\/g, '/');
  const segs: string[] = [];
  for (const seg of joined.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') segs.pop();
    else segs.push(seg);
  }
  return segs.join('/');
}

function dirname(relPath: string): string {
  const norm = relPath.replace(/\\/g, '/');
  const idx = norm.lastIndexOf('/');
  return idx < 0 ? '' : norm.slice(0, idx);
}

/**
 * Given a repo-relative path WITHOUT a guaranteed extension, try the candidate
 * file forms against the known file set. Returns the first hit or `null`.
 */
function matchFile(base: string, files: ReadonlySet<string>): string | null {
  // Exact (specifier already had an extension we recognise).
  if (files.has(base)) return base;
  for (const ext of TRY_EXTENSIONS) {
    const candidate = `${base}${ext}`;
    if (files.has(candidate)) return candidate;
  }
  for (const ext of TRY_EXTENSIONS) {
    const candidate = `${base}/index${ext}`;
    if (files.has(candidate)) return candidate;
  }
  return null;
}

function isRelative(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

/** Expand one alias pattern (`@/*`) + its target (`./src/*`) into a base path. */
function applyAliasTarget(
  pattern: string,
  target: string,
  specifier: string,
): string | null {
  const starIdx = pattern.indexOf('*');
  if (starIdx === -1) {
    // Exact alias (no wildcard) — only matches an identical specifier.
    return specifier === pattern ? target.replace(/\/?\*?$/, '') : null;
  }
  const prefix = pattern.slice(0, starIdx);
  const suffix = pattern.slice(starIdx + 1);
  if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) return null;
  const matched = specifier.slice(prefix.length, specifier.length - suffix.length);
  return target.replace('*', matched);
}

function resolveViaAliases(
  specifier: string,
  aliases: PathAliases,
  files: ReadonlySet<string>,
): string | null {
  for (const [pattern, targets] of Object.entries(aliases.paths)) {
    for (const target of targets) {
      const base = applyAliasTarget(pattern, target, specifier);
      if (base === null) continue;
      const hit = matchFile(joinAndNormalize(aliases.baseUrl, base), files);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Resolve `specifier` imported FROM `importerPath` to a repo-relative file.
 * @param importerPath repo-relative path of the file containing the import
 * @param specifier    the raw module string (e.g. `./Chart`, `@/lib/db`)
 * @param aliases      tsconfig/jsconfig alias snapshot
 * @param files        the set of repo-relative files that actually exist
 * @returns the resolved repo-relative path or `null` when unresolved
 */
export function resolveImport(
  importerPath: string,
  specifier: string,
  aliases: PathAliases,
  files: ReadonlySet<string>,
): string | null {
  if (!specifier) return null;

  // 1. Relative.
  if (isRelative(specifier)) {
    const base = joinAndNormalize(dirname(importerPath), specifier);
    return matchFile(base, files);
  }

  // 2. tsconfig paths aliases.
  const viaAliases = resolveViaAliases(specifier, aliases, files);
  if (viaAliases) return viaAliases;

  // 3. baseUrl resolution for a bare, non-package specifier (only meaningful
  //    when a non-trivial baseUrl is configured).
  if (aliases.baseUrl && aliases.baseUrl !== '.') {
    const viaBaseUrl = matchFile(joinAndNormalize(aliases.baseUrl, specifier), files);
    if (viaBaseUrl) return viaBaseUrl;
  }

  // Everything else (bare package imports like `react`, `@scope/pkg`) → miss.
  return null;
}
