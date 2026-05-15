// Parses a https://github.com/owner/repo[/...] URL into structured parts.
// Used by POST /api/audit-runs and the worker's VALIDATE_INPUT step.

export interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  branch: string | null;
  normalizedUrl: string;
}

const GITHUB_RE = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?(?:\/tree\/([^/\s#?]+))?(?:[#?].*)?$/i;

export function parseGitHubUrl(input: string): ParsedGitHubUrl {
  const trimmed = input.trim();
  const match = GITHUB_RE.exec(trimmed);
  if (!match) {
    throw new Error(
      `GitHub URL 형식이 아닙니다. 예: https://github.com/owner/repo (입력값: ${trimmed})`,
    );
  }
  const owner = match[1];
  const repo = match[2];
  const branch = match[3] ?? null;
  if (!owner || !repo) {
    throw new Error('GitHub URL에서 owner 또는 repo를 인식하지 못했습니다.');
  }
  // Strip trailing `.git` & normalize.
  const repoName = repo.replace(/\.git$/i, '');
  return {
    owner,
    repo: repoName,
    branch,
    normalizedUrl: `https://github.com/${owner}/${repoName}`,
  };
}

export function isValidGitHubUrl(input: string): boolean {
  try {
    parseGitHubUrl(input);
    return true;
  } catch {
    return false;
  }
}
