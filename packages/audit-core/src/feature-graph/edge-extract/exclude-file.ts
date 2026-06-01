// SSOT predicate for "is this a real source file the feature graph should
// reason about?" — drops test/spec/story/declaration/config files plus any
// path that lives under a known infra or test directory.
//
// Used by build-nodes (so a `narrative.test.ts` never becomes a node) and by
// extract-edges (so an import of `./button.stories` resolves to nothing rather
// than fabricating an edge to a non-node). Pure + zero-IO: it only inspects
// the repo-relative path string.

const EXCLUDED_FILENAME_RE =
  /\.(test|spec|stories)\.[^./\\]+$|\.d\.ts$|\.config\.[^./\\]+$/i;

// Directory boundaries that should never contribute graph nodes/edges. Matched
// as a path segment (preceded by a separator or string start, followed by a
// separator) so `my-e2e-helpers/` is NOT excluded but `e2e/` is.
const EXCLUDED_DIR_SEGMENTS: ReadonlyArray<string> = [
  '__tests__',
  '__mocks__',
  'node_modules',
  'dist',
  '.next',
  'e2e',
];

/**
 * Returns `true` when the repo-relative path should be excluded from the
 * feature graph. Tolerates both `/` and `\` separators.
 */
export function isExcludedFile(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, '/');
  if (EXCLUDED_FILENAME_RE.test(norm)) return true;
  const segments = norm.split('/');
  return segments.some((seg) => EXCLUDED_DIR_SEGMENTS.includes(seg));
}
