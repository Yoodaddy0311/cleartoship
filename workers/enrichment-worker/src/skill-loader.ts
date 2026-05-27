import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Resolves the directory holding the `audit-*` skill bundles. In the Cloud Run
 * job image the Dockerfile copies `.claude/skills` to the working directory;
 * `SKILLS_DIR` overrides for tests / non-default layouts.
 */
export function skillsDir(): string {
  return process.env.SKILLS_DIR ?? path.resolve(process.cwd(), '.claude/skills');
}

/**
 * Strip a leading YAML frontmatter block (`---\n…\n---`) from a SKILL.md,
 * returning the markdown body that becomes the LLM system prompt. Returns the
 * input unchanged when there is no frontmatter.
 */
export function stripFrontmatter(md: string): string {
  const match = /^---\n[\s\S]*?\n---\n?/.exec(md);
  return match ? md.slice(match[0].length).replace(/^\s+/, '') : md;
}

/**
 * Load a skill's SKILL.md body by skill name (e.g. 'audit-product-intent').
 * Throws if the file is missing — the orchestrator catches per-category so a
 * single missing skill never fails the whole job.
 */
export function loadSkillBody(skillName: string, dir: string = skillsDir()): string {
  const file = path.join(dir, skillName, 'SKILL.md');
  return stripFrontmatter(readFileSync(file, 'utf-8'));
}
