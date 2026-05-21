import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchRepoMetadata, parseGithubUrl } from './github-api.js';

const REPO_RESPONSE = {
  default_branch: 'main',
  description: 'A vibe-coded launch audit tool',
  size: 1234,
  language: 'TypeScript',
  pushed_at: '2026-05-20T10:00:00Z',
  created_at: '2025-12-01T08:00:00Z',
  stargazers_count: 42,
  forks_count: 5,
  open_issues_count: 3,
  license: { spdx_id: 'MIT', key: 'mit' },
  private: false,
};

const TOPICS_RESPONSE = { names: ['audit', 'vibe-coding', 'no-llm'] };
const LANGUAGES_RESPONSE = { TypeScript: 80000, CSS: 5000, JavaScript: 2000 };
const RELEASE_RESPONSE = {
  tag_name: 'v0.4.0',
  published_at: '2026-05-18T12:00:00Z',
  body: '## Phase 0 ships\n- git + chromium',
};

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

describe('parseGithubUrl', () => {
  it('parses canonical https URL', () => {
    expect(parseGithubUrl('https://github.com/Yoodaddy0311/cleartoship')).toEqual({
      owner: 'Yoodaddy0311',
      repo: 'cleartoship',
    });
  });

  it('tolerates .git suffix', () => {
    expect(parseGithubUrl('https://github.com/owner/repo.git')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('tolerates trailing slash', () => {
    expect(parseGithubUrl('https://github.com/owner/repo/')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('throws on non-github host', () => {
    expect(() => parseGithubUrl('https://gitlab.com/owner/repo')).toThrow(/Failed to parse/);
  });
});

describe('fetchRepoMetadata', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function mockHappyPath(): void {
    fetchSpy.mockImplementation((input) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url.endsWith('/topics')) return Promise.resolve(jsonResponse(TOPICS_RESPONSE));
      if (url.endsWith('/languages')) return Promise.resolve(jsonResponse(LANGUAGES_RESPONSE));
      if (url.endsWith('/releases/latest')) return Promise.resolve(jsonResponse(RELEASE_RESPONSE));
      return Promise.resolve(jsonResponse(REPO_RESPONSE));
    });
  }

  it('returns a full RepoMetadata snapshot on the happy path', async () => {
    mockHappyPath();
    const md = await fetchRepoMetadata('https://github.com/owner/repo', undefined);
    expect(md.owner).toBe('owner');
    expect(md.repo).toBe('repo');
    expect(md.defaultBranch).toBe('main');
    expect(md.description).toBe('A vibe-coded launch audit tool');
    expect(md.topics).toEqual(['audit', 'vibe-coding', 'no-llm']);
    expect(md.license).toBe('MIT');
    expect(md.stars).toBe(42);
    expect(md.languages).toEqual({ TypeScript: 80000, CSS: 5000, JavaScript: 2000 });
    expect(md.primaryLanguage).toBe('TypeScript');
    expect(md.latestRelease).toEqual({
      tag: 'v0.4.0',
      publishedAt: '2026-05-18T12:00:00Z',
      notes: '## Phase 0 ships\n- git + chromium',
    });
    expect(md.authenticated).toBe(false);
  });

  it('tolerates 404 on /releases/latest by setting latestRelease to null', async () => {
    fetchSpy.mockImplementation((input) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url.endsWith('/topics')) return Promise.resolve(jsonResponse(TOPICS_RESPONSE));
      if (url.endsWith('/languages')) return Promise.resolve(jsonResponse(LANGUAGES_RESPONSE));
      if (url.endsWith('/releases/latest'))
        return Promise.resolve(new Response('Not Found', { status: 404 }));
      return Promise.resolve(jsonResponse(REPO_RESPONSE));
    });
    const md = await fetchRepoMetadata('https://github.com/owner/repo', undefined);
    expect(md.latestRelease).toBeNull();
  });

  it('flags authenticated=true when a token is provided', async () => {
    mockHappyPath();
    const md = await fetchRepoMetadata('https://github.com/owner/repo', 'ghp_test_token');
    expect(md.authenticated).toBe(true);
  });

  it('sends the Authorization header when token is provided', async () => {
    mockHappyPath();
    await fetchRepoMetadata('https://github.com/owner/repo', 'ghp_test_token');
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer ghp_test_token');
  });

  it('omits Authorization header when no token', async () => {
    mockHappyPath();
    await fetchRepoMetadata('https://github.com/owner/repo', undefined);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('throws a 4xx for non-404 errors with body preview', async () => {
    fetchSpy.mockResolvedValue(new Response('upstream borked', { status: 500 }));
    await expect(
      fetchRepoMetadata('https://github.com/owner/repo', undefined)
    ).rejects.toThrow(/500.*upstream borked/);
  });

  it('throws a rate-limit message on 403 with reset hint', async () => {
    fetchSpy.mockResolvedValue(
      new Response('rate limit', {
        status: 403,
        headers: { 'x-ratelimit-reset': '1779271234', 'x-ratelimit-remaining': '0' },
      })
    );
    await expect(
      fetchRepoMetadata('https://github.com/owner/repo', undefined)
    ).rejects.toThrow(/rate-limited.*GITHUB_TOKEN.*5000/);
  });

  it('rejects private repos with a clear message', async () => {
    fetchSpy.mockImplementation((input) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url.endsWith('/topics')) return Promise.resolve(jsonResponse(TOPICS_RESPONSE));
      if (url.endsWith('/languages')) return Promise.resolve(jsonResponse(LANGUAGES_RESPONSE));
      if (url.endsWith('/releases/latest'))
        return Promise.resolve(new Response('Not Found', { status: 404 }));
      return Promise.resolve(jsonResponse({ ...REPO_RESPONSE, private: true }));
    });
    await expect(
      fetchRepoMetadata('https://github.com/owner/repo', undefined)
    ).rejects.toThrow(/private.*only audits public/);
  });

  it('defaults license to null when GitHub returns no license object', async () => {
    fetchSpy.mockImplementation((input) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url.endsWith('/topics')) return Promise.resolve(jsonResponse(TOPICS_RESPONSE));
      if (url.endsWith('/languages')) return Promise.resolve(jsonResponse(LANGUAGES_RESPONSE));
      if (url.endsWith('/releases/latest'))
        return Promise.resolve(new Response('Not Found', { status: 404 }));
      return Promise.resolve(jsonResponse({ ...REPO_RESPONSE, license: null }));
    });
    const md = await fetchRepoMetadata('https://github.com/owner/repo', undefined);
    expect(md.license).toBeNull();
  });
});
