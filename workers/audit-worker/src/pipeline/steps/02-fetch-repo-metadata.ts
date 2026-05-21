// FETCH_REPO_METADATA — PR-A1 expanded.
//
// Original Phase 0 step pulled only 5 fields (default_branch, description,
// size, language, pushed_at). PR-A1 expands the surface to the full
// `RepoMetadata` shape (PRD source-driven-extraction §3.1): topics,
// languages bytes, stars/forks/open issues, license, latest release,
// created_at, and the authenticated/anonymous flag.
//
// Size gate (200 MB) is preserved — the audit pipeline downstream of clone
// can't process megalithic repos in the 5-min user-facing budget.
//
// Authentication: `GITHUB_TOKEN` env (set by infra for prod / staging) flips
// the rate-limit budget from 60/h anonymous → 5000/h authenticated. The
// `authenticated` field in the resulting metadata surfaces this to the audit
// report so operators can spot anonymous-mode runs.

import type { Step } from './index.js';
import { fetchRepoMetadata } from '../../integrations/github-api.js';

const MAX_REPO_SIZE_KB = 200_000;

export const step02FetchRepoMetadata: Step = {
  step: 'FETCH_REPO_METADATA',
  async execute(ctx, state) {
    const token = process.env.GITHUB_TOKEN;
    const metadata = await fetchRepoMetadata(ctx.repoUrl, token);

    if (metadata.sizeKb > MAX_REPO_SIZE_KB) {
      throw new Error(
        `Repo가 너무 큽니다 (${Math.round(metadata.sizeKb / 1024)} MB). 200MB 이하만 지원합니다.`
      );
    }

    state.repoMetadata = metadata;
    ctx.log('info', 'Repo metadata fetched', {
      owner: metadata.owner,
      repo: metadata.repo,
      sizeKb: metadata.sizeKb,
      primaryLanguage: metadata.primaryLanguage,
      topicsCount: metadata.topics.length,
      stars: metadata.stars,
      hasLatestRelease: metadata.latestRelease !== null,
      authenticated: metadata.authenticated,
    });
  },
};
