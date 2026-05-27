import { describe, it, expect } from 'vitest';
import {
  scoreMaintainability,
  type MaintainabilitySignals,
} from './maintainability-patterns.js';

/** A bare repo: no W1-A markers, only a couple of stray source files. */
function bareSignals(
  overrides: Partial<MaintainabilitySignals> = {},
): MaintainabilitySignals {
  return {
    fileTree: ['src/index.ts', 'src/app.ts'],
    hasReadme: false,
    hasTests: false,
    hasCiConfig: false,
    hasLicense: false,
    hasPackageScripts: false,
    ...overrides,
  };
}

/** A fully documented, tested, configured repo. */
function richSignals(
  overrides: Partial<MaintainabilitySignals> = {},
): MaintainabilitySignals {
  return {
    fileTree: [
      'README.md',
      'LICENSE',
      'CHANGELOG.md',
      'CONTRIBUTING.md',
      'tsconfig.json',
      '.prettierrc',
      '.editorconfig',
      '.gitignore',
      'package.json',
      'docs/architecture.md',
      'src/index.ts',
      'tests/index.test.ts',
    ],
    hasReadme: true,
    hasTests: true,
    hasCiConfig: true,
    hasLicense: true,
    hasPackageScripts: true,
    ...overrides,
  };
}

function matchedIds(signals: MaintainabilitySignals): string[] {
  const r = scoreMaintainability(signals);
  return (r?.matched ?? []).map((m) => m.patternId);
}

describe('scoreMaintainability', () => {
  it('returns null when fileTree is empty (clone failed → category stays N/A)', () => {
    expect(scoreMaintainability(bareSignals({ fileTree: [] }))).toBeNull();
  });

  it('returns a result with origin "D" whenever there are files', () => {
    const r = scoreMaintainability(bareSignals());
    expect(r).not.toBeNull();
    expect(r?.origin).toBe('D');
  });

  it('scores a fully-documented+tested+configured repo high (>=80)', () => {
    const r = scoreMaintainability(richSignals());
    expect(r?.score).toBeGreaterThanOrEqual(80);
  });

  it('scores a bare repo low (<=45)', () => {
    const r = scoreMaintainability(bareSignals());
    expect(r?.score).toBeLessThanOrEqual(45);
  });

  it('is HIGH confidence (>=5 patterns are always evaluated)', () => {
    expect(scoreMaintainability(richSignals())?.confidence).toBe('HIGH');
    expect(scoreMaintainability(bareSignals())?.confidence).toBe('HIGH');
  });

  it('applies the no-tests risk penalty when tests are absent', () => {
    const withTests = scoreMaintainability(richSignals({ hasTests: true }));
    const withoutTests = scoreMaintainability(richSignals({ hasTests: false }));
    // Dropping tests removes the +tests impact AND adds the negative risk
    // impact, so the score must fall by strictly more than the tests weight.
    expect(withoutTests!.score).toBeLessThan(withTests!.score);
    expect(matchedIds(richSignals({ hasTests: false }))).toContain('MNT-no-tests');
    expect(matchedIds(richSignals({ hasTests: true }))).not.toContain('MNT-no-tests');
  });

  it('detects the MNT-tests pattern from the W1-A hasTests flag', () => {
    expect(matchedIds(bareSignals({ hasTests: true }))).toContain('MNT-tests');
    expect(matchedIds(bareSignals({ hasTests: false }))).not.toContain('MNT-tests');
  });

  it('detects MNT-readme from the W1-A hasReadme flag', () => {
    expect(matchedIds(bareSignals({ hasReadme: true }))).toContain('MNT-readme');
    expect(matchedIds(bareSignals({ hasReadme: false }))).not.toContain('MNT-readme');
  });

  it('detects a docs/ directory (MNT-docs-dir)', () => {
    expect(matchedIds(bareSignals({ fileTree: ['docs/guide.md', 'src/x.ts'] }))).toContain(
      'MNT-docs-dir',
    );
    expect(matchedIds(bareSignals({ fileTree: ['src/x.ts'] }))).not.toContain('MNT-docs-dir');
  });

  it('does not treat a non-docs path containing "docs" as a docs dir', () => {
    expect(
      matchedIds(bareSignals({ fileTree: ['src/docsHelper.ts', 'mydocs.txt'] })),
    ).not.toContain('MNT-docs-dir');
  });

  it('detects a root CHANGELOG (MNT-changelog) but not a nested one', () => {
    expect(matchedIds(bareSignals({ fileTree: ['CHANGELOG.md'] }))).toContain('MNT-changelog');
    expect(
      matchedIds(bareSignals({ fileTree: ['packages/a/CHANGELOG.md'] })),
    ).not.toContain('MNT-changelog');
  });

  it('detects a root CONTRIBUTING file (MNT-contributing)', () => {
    expect(matchedIds(bareSignals({ fileTree: ['CONTRIBUTING.md'] }))).toContain(
      'MNT-contributing',
    );
    expect(matchedIds(bareSignals({ fileTree: ['src/x.ts'] }))).not.toContain('MNT-contributing');
  });

  it('detects tsconfig*.json (MNT-typescript-config) at any depth', () => {
    expect(matchedIds(bareSignals({ fileTree: ['tsconfig.json'] }))).toContain(
      'MNT-typescript-config',
    );
    expect(matchedIds(bareSignals({ fileTree: ['packages/a/tsconfig.build.json'] }))).toContain(
      'MNT-typescript-config',
    );
    expect(matchedIds(bareSignals({ fileTree: ['src/x.ts'] }))).not.toContain(
      'MNT-typescript-config',
    );
  });

  it('detects formatter/linter configs (MNT-formatter-linter)', () => {
    expect(matchedIds(bareSignals({ fileTree: ['.prettierrc'] }))).toContain('MNT-formatter-linter');
    expect(matchedIds(bareSignals({ fileTree: ['.eslintrc.json'] }))).toContain('MNT-formatter-linter');
    expect(matchedIds(bareSignals({ fileTree: ['eslint.config.mjs'] }))).toContain('MNT-formatter-linter');
    expect(matchedIds(bareSignals({ fileTree: ['biome.json'] }))).toContain('MNT-formatter-linter');
    expect(matchedIds(bareSignals({ fileTree: ['src/x.ts'] }))).not.toContain('MNT-formatter-linter');
  });

  it('detects .editorconfig and .gitignore (small positives)', () => {
    expect(matchedIds(bareSignals({ fileTree: ['.editorconfig'] }))).toContain('MNT-editorconfig');
    expect(matchedIds(bareSignals({ fileTree: ['.gitignore'] }))).toContain('MNT-gitignore');
  });

  it('orders the bare repo strictly below the rich repo', () => {
    const bare = scoreMaintainability(bareSignals())!.score;
    const rich = scoreMaintainability(richSignals())!.score;
    expect(bare).toBeLessThan(rich);
  });
});
