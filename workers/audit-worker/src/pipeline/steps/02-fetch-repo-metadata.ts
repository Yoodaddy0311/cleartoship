import type { Step } from './index.js';

// Public GitHub REST API (no auth needed for public repos).
const GITHUB_API = 'https://api.github.com';

interface GithubRepoResponse {
  default_branch: string;
  description: string | null;
  size: number; // KB
  language: string | null;
  pushed_at: string | null;
}

export const step02FetchRepoMetadata: Step = {
  step: 'FETCH_REPO_METADATA',
  async execute(ctx, state) {
    const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(ctx.repoUrl);
    if (!match) throw new Error(`Failed to parse owner/repo from ${ctx.repoUrl}`);
    const [, owner, repo] = match;
    const url = `${GITHUB_API}/repos/${owner}/${repo}`;
    const resp = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ClearToShip-Audit' },
    });
    if (!resp.ok) {
      throw new Error(`GitHub API error ${resp.status} for ${owner}/${repo}`);
    }
    const data = (await resp.json()) as GithubRepoResponse;
    if (data.size > 200_000) {
      throw new Error(`Repo가 너무 큽니다 (${Math.round(data.size / 1024)} MB). 200MB 이하만 지원합니다.`);
    }
    state.repoMetadata = {
      defaultBranch: data.default_branch,
      description: data.description,
      sizeKb: data.size,
      primaryLanguage: data.language,
      pushedAt: data.pushed_at,
    };
    ctx.log('info', 'Repo metadata fetched', { sizeKb: data.size, lang: data.language });
  },
};
