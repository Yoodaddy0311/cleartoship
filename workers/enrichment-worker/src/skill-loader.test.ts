import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadSkillBody, stripFrontmatter } from './skill-loader.js';

describe('stripFrontmatter', () => {
  it('removes a leading YAML frontmatter block', () => {
    const md = '---\nname: x\ndescription: y\n---\n# Body\ntext';
    expect(stripFrontmatter(md)).toBe('# Body\ntext');
  });

  it('returns the input unchanged when there is no frontmatter', () => {
    expect(stripFrontmatter('# Just a body')).toBe('# Just a body');
  });

  it('only strips the FIRST frontmatter block, leaving inline --- alone', () => {
    const md = '---\nname: x\n---\n# Body\n---\nfooter';
    expect(stripFrontmatter(md)).toBe('# Body\n---\nfooter');
  });
});

describe('loadSkillBody', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'skills-'));
    mkdirSync(path.join(dir, 'audit-product-intent'), { recursive: true });
    writeFileSync(
      path.join(dir, 'audit-product-intent', 'SKILL.md'),
      '---\nname: audit-product-intent\n---\n# audit-product-intent\nworkflow here',
      'utf-8',
    );
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('loads a skill body with frontmatter stripped', () => {
    const body = loadSkillBody('audit-product-intent', dir);
    expect(body.startsWith('# audit-product-intent')).toBe(true);
    expect(body).not.toContain('name: audit-product-intent');
  });

  it('throws for a missing skill (orchestrator catches per-category)', () => {
    expect(() => loadSkillBody('does-not-exist', dir)).toThrow();
  });
});
