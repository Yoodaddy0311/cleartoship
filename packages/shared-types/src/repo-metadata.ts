// Source-driven extraction Phase A1 (PRD `source-driven-extraction-2026-05-20.md` §3.1).
//
// GitHub-API-derived metadata about the audited repo. Used as a Free-API (F)
// signal alongside Deterministic (D) code analysis to fill the `제품 의도`
// category that today returns N/A whenever the submitter doesn't attach a PRD.
//
// The shape is deliberately wider than what step02 originally captured
// (only default_branch, description, size, language, pushed_at) so a single
// network round-trip per audit can feed both the existing pipeline AND the
// future intent-scoring step without re-fetching.
//
// All fields are optional or nullable: GitHub's REST surface returns nulls
// for unset descriptions / missing releases, and audited repos may be
// brand-new with zero topics / stars / releases. The audit must keep working
// on those.

import { z } from 'zod';

export const RepoReleaseSchema = z.object({
  /** e.g. "v1.4.2" — the git tag. */
  tag: z.string(),
  /** ISO timestamp of the release publish. */
  publishedAt: z.string(),
  /** Markdown body of the release notes; null when the maintainer left it blank. */
  notes: z.string().nullable(),
});
export type RepoRelease = z.infer<typeof RepoReleaseSchema>;

/**
 * Languages breakdown as returned by `GET /repos/{owner}/{repo}/languages`.
 * Keys are language names ("TypeScript", "CSS"); values are byte counts.
 * The UI / scoring should convert to percentages itself so the raw signal
 * is preserved here.
 */
export const RepoLanguageBytesSchema = z.record(z.string(), z.number());
export type RepoLanguageBytes = z.infer<typeof RepoLanguageBytesSchema>;

export const RepoMetadataSchema = z.object({
  // --- Identity ---
  /** "vercel" portion of github.com/vercel/next.js. */
  owner: z.string(),
  /** "next.js" portion. */
  repo: z.string(),
  /** Branch the maintainers consider canonical (e.g. "main", "master"). */
  defaultBranch: z.string(),

  // --- Intent signals (the reason A1 exists) ---
  /** One-line description from GitHub's repo settings. */
  description: z.string().nullable(),
  /** Free-form classification tags ("react", "audit", "vibe-coding", ...). */
  topics: z.array(z.string()),
  /** SPDX-style license identifier ("MIT", "Apache-2.0") or null when unset. */
  license: z.string().nullable(),

  // --- Engagement / maturity signals (boost confidence in 출시 가능성) ---
  stars: z.number().int().nonnegative(),
  forks: z.number().int().nonnegative(),
  openIssues: z.number().int().nonnegative(),
  /** Bytes per language. Compute percentages downstream. */
  languages: RepoLanguageBytesSchema,
  /** Primary language as reported by GitHub (top entry of `languages`). */
  primaryLanguage: z.string().nullable(),
  /** Total repo size on GitHub's side, in KB (NOT bytes). */
  sizeKb: z.number().int().nonnegative(),
  /** ISO timestamp of the last push to defaultBranch. Drives staleness signals. */
  pushedAt: z.string().nullable(),
  /** ISO timestamp of repo creation. */
  createdAt: z.string().nullable(),

  // --- Release lifecycle ---
  /** Latest published release; null when no releases exist. */
  latestRelease: RepoReleaseSchema.nullable(),

  // --- Provenance ---
  /** ISO timestamp the worker fetched this snapshot (for cache freshness). */
  retrievedAt: z.string(),
  /**
   * `true` when the fetch was performed with a GitHub token (5000 req/h
   * rate-limit budget). `false` for anonymous (60 req/h, risk of 403 on busy
   * deploys). Surfaces to operators as an ops-readiness signal.
   */
  authenticated: z.boolean(),
});
export type RepoMetadata = z.infer<typeof RepoMetadataSchema>;
