import { describe, it, expect } from 'vitest';
import config from './vitest.config';

describe('vitest.config', () => {
  it('uses node environment for vitest', () => {
    expect(config.test?.environment).toBe('node');
  });

  it('includes lib, app, components, and root-level test patterns', () => {
    const include = config.test?.include ?? [];
    expect(include).toEqual(
      expect.arrayContaining([
        '*.test.ts',
        '*.test.tsx',
        'lib/**/*.test.ts',
        'lib/**/*.test.tsx',
        'app/**/*.test.ts',
        'app/**/*.test.tsx',
        'components/**/*.test.ts',
        'components/**/*.test.tsx',
      ])
    );
  });

  it('routes tsx + component .ts tests to jsdom via environmentMatchGlobs', () => {
    const matchGlobs = config.test?.environmentMatchGlobs ?? [];
    expect(matchGlobs).toEqual(
      expect.arrayContaining([
        ['**/*.test.tsx', 'jsdom'],
        ['components/**/*.test.ts', 'jsdom'],
      ])
    );
  });

  it('loads vitest.setup.ts for jest-dom + RTL cleanup', () => {
    const setupFiles = config.test?.setupFiles;
    const list = Array.isArray(setupFiles)
      ? setupFiles
      : typeof setupFiles === 'string'
        ? [setupFiles]
        : [];
    expect(list).toEqual(expect.arrayContaining(['./vitest.setup.ts']));
  });

  it('declares workspace aliases for shared packages and root', () => {
    const alias = config.resolve?.alias as Record<string, string> | undefined;
    expect(alias).toBeDefined();
    expect(alias?.['@']).toMatch(/cleartoship[\\/]apps[\\/]web$/);
    expect(alias?.['@cleartoship/shared-types']).toContain('shared-types');
    expect(alias?.['@cleartoship/audit-core']).toContain('audit-core');
    expect(alias?.['@cleartoship/ui']).toContain('ui');
  });

  it('configures v8 coverage with lib scope', () => {
    const coverage = config.test?.coverage as
      | { provider?: string; include?: string[]; exclude?: string[] }
      | undefined;
    expect(coverage?.provider).toBe('v8');
    expect(coverage?.include).toEqual(['lib/**/*.ts']);
    expect(coverage?.exclude).toEqual(['lib/**/*.test.ts']);
  });
});
