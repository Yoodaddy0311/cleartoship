import { describe, it, expect } from 'vitest';
import {
  getSampleRepos,
  getSampleRepoById,
  type SampleRepo,
} from './sample-repos';

describe('sample-repos fixture', () => {
  it('exposes exactly 5 sample repos', () => {
    const repos = getSampleRepos();
    expect(repos).toHaveLength(5);
  });

  it('has no duplicate ids', () => {
    const repos = getSampleRepos();
    const ids = repos.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses valid https GitHub urls for every entry', () => {
    const repos = getSampleRepos();
    for (const repo of repos) {
      expect(repo.url).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
    }
  });

  it('declares non-empty expectedTech for every entry', () => {
    const repos = getSampleRepos();
    for (const repo of repos) {
      expect(Array.isArray(repo.expectedTech)).toBe(true);
      expect(repo.expectedTech.length).toBeGreaterThan(0);
      for (const tech of repo.expectedTech) {
        expect(typeof tech).toBe('string');
        expect(tech.length).toBeGreaterThan(0);
      }
    }
  });

  it('requires minCategories >= 3 for every entry', () => {
    const repos = getSampleRepos();
    for (const repo of repos) {
      expect(repo.minCategories).toBeGreaterThanOrEqual(3);
    }
  });

  it('includes a human-readable reason per entry', () => {
    const repos = getSampleRepos();
    for (const repo of repos) {
      expect(typeof repo.reason).toBe('string');
      expect(repo.reason.trim().length).toBeGreaterThan(0);
    }
  });

  it('covers diverse stacks (typescript, python, nextjs, express, monorepo)', () => {
    const repos = getSampleRepos();
    const ids = repos.map((r) => r.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/typescript|ts-lib/i),
        expect.stringMatching(/python/i),
        expect.stringMatching(/next/i),
        expect.stringMatching(/express/i),
        expect.stringMatching(/monorepo/i),
      ]),
    );
  });

  it('returns the matching repo via getSampleRepoById', () => {
    const repos = getSampleRepos();
    const first = repos[0] as SampleRepo;
    const found = getSampleRepoById(first.id);
    expect(found).toEqual(first);
  });

  it('returns undefined when getSampleRepoById is given an unknown id', () => {
    expect(getSampleRepoById('does-not-exist-xyz')).toBeUndefined();
  });

  it('returns a readonly array (cannot mutate fixture)', () => {
    const repos = getSampleRepos();
    expect(() => {
      // @ts-expect-error - readonly enforcement at type level; verify runtime freeze
      repos.push({
        id: 'mutant',
        url: 'https://github.com/x/y',
        expectedTech: ['x'],
        minCategories: 3,
        reason: 'nope',
      });
    }).toThrow();
  });
});
