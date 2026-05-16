// Vitest config integrity tests — sibling-located on purpose.
// Catches accidental regressions in test runner setup (e.g. someone disabling
// jsdom for .tsx tests would let DOM-touching tests silently no-op).

import { describe, it, expect } from 'vitest';
import config from './vitest.config.js';

describe('packages/ui vitest config', () => {
  it('uses jsdom for .tsx tests (component DOM assertions)', () => {
    const matchers = config.test?.environmentMatchGlobs;
    expect(matchers).toBeDefined();
    const tsxMatcher = matchers?.find(([glob]) => glob.endsWith('.test.tsx'));
    expect(tsxMatcher?.[1]).toBe('jsdom');
  });

  it('keeps a node default environment for non-tsx tests', () => {
    expect(config.test?.environment).toBe('node');
  });

  it('includes both .ts and .tsx sibling test files', () => {
    expect(config.test?.include).toEqual([
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
    ]);
  });

  it('enforces coverage thresholds on lib helpers (sprint-1 scope)', () => {
    const cov = config.test?.coverage;
    expect(cov?.thresholds).toMatchObject({
      lines: 80,
      functions: 80,
      branches: 70,
      statements: 80,
    });
    expect(cov?.include).toEqual(['src/lib/**/*.ts']);
  });

  it('uses automatic JSX runtime (no manual React imports needed)', () => {
    expect(config.esbuild?.jsx).toBe('automatic');
  });
});
