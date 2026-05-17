/**
 * Sample repositories used for MVP demo + regression coverage.
 *
 * NOTE: Pure fixture module. No network calls. The associated E2E spec
 * (added in a later sprint) is responsible for actually hitting these
 * repos through the ClearToShip pipeline.
 *
 * Diversity rationale: we cover five distinct shapes (small TS lib,
 * Python project, Next.js app, Express backend, monorepo) so the audit
 * engine is exercised across typical real-world stacks our users ship.
 */

export type SampleRepo = {
  readonly id: string;
  readonly url: string;
  readonly expectedTech: readonly string[];
  readonly minCategories: number;
  readonly reason: string;
};

const SAMPLE_REPOS: readonly SampleRepo[] = Object.freeze([
  Object.freeze({
    id: 'ts-lib-sindresorhus-is',
    url: 'https://github.com/sindresorhus/is',
    expectedTech: Object.freeze(['typescript', 'node', 'ava']) as readonly string[],
    minCategories: 4,
    reason:
      'Small, well-maintained TypeScript runtime type-check library. Exercises pure TS audit path with no framework noise.',
  }),
  Object.freeze({
    id: 'python-psf-requests',
    url: 'https://github.com/psf/requests',
    expectedTech: Object.freeze(['python', 'pytest', 'urllib3']) as readonly string[],
    minCategories: 4,
    reason:
      'Canonical Python HTTP library. Validates non-Node toolchain detection and Python-specific category routing.',
  }),
  Object.freeze({
    id: 'nextjs-vercel-commerce',
    url: 'https://github.com/vercel/commerce',
    expectedTech: Object.freeze([
      'nextjs',
      'react',
      'typescript',
      'tailwindcss',
    ]) as readonly string[],
    minCategories: 5,
    reason:
      'Reference Next.js App Router commerce template. Covers SSR/edge + frontend categories simultaneously.',
  }),
  Object.freeze({
    id: 'express-expressjs-express',
    url: 'https://github.com/expressjs/express',
    expectedTech: Object.freeze(['node', 'express', 'javascript']) as readonly string[],
    minCategories: 3,
    reason:
      'Classic Express backend. Smallest meaningful Node server surface for routing/middleware audit signals.',
  }),
  Object.freeze({
    id: 'monorepo-vercel-turbo',
    url: 'https://github.com/vercel/turbo',
    expectedTech: Object.freeze([
      'turborepo',
      'pnpm',
      'typescript',
      'rust',
    ]) as readonly string[],
    minCategories: 5,
    reason:
      'Active monorepo with TS + Rust workspaces. Exercises multi-package detection and workspace traversal.',
  }),
]);

/**
 * Returns the immutable list of sample repos used for demo + regression.
 */
export function getSampleRepos(): readonly SampleRepo[] {
  return SAMPLE_REPOS;
}

/**
 * Lookup helper. Returns the matching repo or `undefined` when not found.
 * Intentionally returns `undefined` (not throw) so callers can decide how
 * to handle missing fixtures.
 */
export function getSampleRepoById(id: string): SampleRepo | undefined {
  return SAMPLE_REPOS.find((repo) => repo.id === id);
}
