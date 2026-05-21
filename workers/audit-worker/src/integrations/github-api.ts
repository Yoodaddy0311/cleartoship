// GitHub REST v3 client for repo metadata extraction (PR-A1).
//
// Scope: read-only, public-repo-friendly. Three endpoints used:
//   - GET /repos/{owner}/{repo}                 → identity + counts + dates + license
//   - GET /repos/{owner}/{repo}/topics          → classification tags
//   - GET /repos/{owner}/{repo}/languages       → byte breakdown
//   - GET /repos/{owner}/{repo}/releases/latest → most recent release (optional)
//
// Auth strategy:
//   - When `GITHUB_TOKEN` env is set → authenticated (5000 req/h).
//   - Otherwise → anonymous (60 req/h). Acceptable for low-volume staging
//     but production runs should always set GITHUB_TOKEN to avoid 403 storms.
//
// Errors:
//   - 404 (private/missing repo) → throws a descriptive Error the pipeline
//     surfaces to the user instead of degrading silently.
//   - 403 (rate limit) → throws with the reset timestamp so the operator can
//     diagnose authenticated-vs-anonymous quickly.
//   - Other non-2xx → throws with status code + first 200 chars of the body.
//
// The "topics" endpoint requires the `application/vnd.github.mercy-preview+json`
// media type (legacy preview header retained for backward compatibility on
// older GHES installs); modern GitHub.com accepts the default JSON accept too,
// but we send both to keep the call robust.

import type { RepoMetadata, RepoRelease } from '@cleartoship/shared-types';

const GITHUB_API = 'https://api.github.com';
const USER_AGENT = 'ClearToShip-Audit';

const REPO_URL_PATTERN = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i;

/** Lightweight subset of GitHub's `repos/{o}/{r}` response we consume. */
interface GithubRepoResponse {
  default_branch: string;
  description: string | null;
  size: number;
  language: string | null;
  pushed_at: string | null;
  created_at: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  license: { spdx_id: string | null; key: string | null } | null;
  private: boolean;
}

interface GithubReleaseResponse {
  tag_name: string;
  published_at: string | null;
  body: string | null;
}

interface GithubTopicsResponse {
  names: string[];
}

export interface ParsedRepoUrl {
  owner: string;
  repo: string;
}

/**
 * Parse `https://github.com/owner/repo[.git]` into its parts. Throws when
 * the URL doesn't match — callers should validate before calling this.
 */
export function parseGithubUrl(repoUrl: string): ParsedRepoUrl {
  const match = REPO_URL_PATTERN.exec(repoUrl);
  if (!match) {
    throw new Error(`Failed to parse owner/repo from ${repoUrl}`);
  }
  return { owner: match[1], repo: match[2] };
}

function buildHeaders(token: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json, application/vnd.github.mercy-preview+json',
    'User-Agent': USER_AGENT,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function ghFetch(
  url: string,
  token: string | undefined,
  allow404 = false
): Promise<unknown | null> {
  const resp = await fetch(url, { headers: buildHeaders(token) });
  if (resp.status === 404 && allow404) {
    return null;
  }
  if (!resp.ok) {
    let bodyPreview = '';
    try {
      bodyPreview = (await resp.text()).slice(0, 200);
    } catch {
      // ignore — preview is best-effort
    }
    if (resp.status === 403) {
      const reset = resp.headers.get('x-ratelimit-reset');
      const remaining = resp.headers.get('x-ratelimit-remaining');
      throw new Error(
        `GitHub API rate-limited (${url}). remaining=${remaining ?? '?'}, ` +
          `reset=${reset ?? '?'}. Set GITHUB_TOKEN to raise the budget from 60/h to 5000/h.`
      );
    }
    throw new Error(`GitHub API error ${resp.status} for ${url}: ${bodyPreview}`);
  }
  return resp.json();
}

/**
 * Fetch the full RepoMetadata for a public GitHub repo. Four parallel
 * sub-requests; total wall-clock typically 200-500ms.
 *
 * `repoUrl` must be `https://github.com/<owner>/<repo>` (with or without
 * `.git` suffix or trailing slash).
 */
export async function fetchRepoMetadata(
  repoUrl: string,
  token: string | undefined
): Promise<RepoMetadata> {
  const { owner, repo } = parseGithubUrl(repoUrl);
  const base = `${GITHUB_API}/repos/${owner}/${repo}`;

  // Fire the four reads in parallel. The repo, topics, and languages reads
  // are required; the latest-release read can 404 (no releases) and we
  // tolerate that.
  const [repoData, topicsData, languagesData, releaseData] = await Promise.all([
    ghFetch(base, token) as Promise<GithubRepoResponse>,
    ghFetch(`${base}/topics`, token) as Promise<GithubTopicsResponse>,
    ghFetch(`${base}/languages`, token) as Promise<Record<string, number>>,
    ghFetch(`${base}/releases/latest`, token, true) as Promise<GithubReleaseResponse | null>,
  ]);

  // Private-repo branch: GitHub will 404 on `base` for anonymous auth, but
  // for authenticated auth with insufficient scope it returns 200 with
  // `private: true`. Reject either way — the worker can't clone what it
  // can't read.
  if (repoData.private) {
    throw new Error(`Repo ${owner}/${repo} is private. ClearToShip only audits public repos.`);
  }

  let latestRelease: RepoRelease | null = null;
  if (releaseData) {
    latestRelease = {
      tag: releaseData.tag_name,
      publishedAt: releaseData.published_at ?? '',
      notes: releaseData.body,
    };
  }

  return {
    owner,
    repo,
    defaultBranch: repoData.default_branch,
    description: repoData.description,
    topics: topicsData.names ?? [],
    license: repoData.license?.spdx_id ?? repoData.license?.key ?? null,
    stars: repoData.stargazers_count,
    forks: repoData.forks_count,
    openIssues: repoData.open_issues_count,
    languages: languagesData ?? {},
    primaryLanguage: repoData.language,
    sizeKb: repoData.size,
    pushedAt: repoData.pushed_at,
    createdAt: repoData.created_at,
    latestRelease,
    retrievedAt: new Date().toISOString(),
    authenticated: token !== undefined && token.length > 0,
  };
}
