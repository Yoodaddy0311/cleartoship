import { describe, it, expect } from 'vitest';
import {
  scoreFrontendCode,
  type FrontendCodeSignals,
} from './frontend-code-patterns.js';

function run(
  fileTree: ReadonlyArray<string>,
  extra: Partial<Omit<FrontendCodeSignals, 'fileTree'>> = {},
) {
  return scoreFrontendCode({ fileTree, ...extra });
}

/** A healthy modern React + TS + modules + stories + tests + hooks tree. */
const HEALTHY: ReadonlyArray<string> = [
  'package.json',
  'tsconfig.json',
  'tailwind.config.ts',
  'src/components/Button.tsx',
  'src/components/Button.module.css',
  'src/components/Button.stories.tsx',
  'src/components/Button.test.tsx',
  'src/components/Card.tsx',
  'src/components/Modal.tsx',
  'src/components/Nav.tsx',
  'src/hooks/useAuth.ts',
  'src/app/page.tsx',
  'src/app/layout.tsx',
];

/** A bare CRA-ish tree: a couple components, one global stylesheet, no TS. */
const BARE: ReadonlyArray<string> = [
  'package.json',
  'src/App.jsx',
  'src/Widget.jsx',
  'src/styles.css',
];

describe('scoreFrontendCode', () => {
  it('returns null when there is no frontend code at all', () => {
    const r = run([
      'package.json',
      'src/server.ts',
      'src/db/schema.prisma',
      'README.md',
    ]);
    expect(r).toBeNull();
  });

  it('returns null when the only .tsx files are route files', () => {
    // page/layout/route are not reusable components → no frontend "code".
    const r = run([
      'app/page.tsx',
      'app/layout.tsx',
      'app/api/users/route.ts',
    ]);
    expect(r).toBeNull();
  });

  it('scores a healthy React+TS tree high (≥70)', () => {
    const r = run(HEALTHY);
    expect(r).not.toBeNull();
    expect(r!.score).toBeGreaterThanOrEqual(70);
    expect(r!.origin).toBe('D');
  });

  it('scores a bare single-global-css tree lower than a healthy one', () => {
    const bare = run(BARE)!;
    const healthy = run(HEALTHY)!;
    expect(bare.score).toBeLessThan(healthy.score);
    expect(bare.score).toBeLessThanOrEqual(55);
  });

  it('is HIGH confidence (≥5 patterns evaluated)', () => {
    expect(run(HEALTHY)!.confidence).toBe('HIGH');
  });

  it('excludes test/story/route files from the component counter', () => {
    // Only Button.tsx is a real component; the other 3 are test/story/route.
    const r = run([
      'src/Button.tsx',
      'src/Button.test.tsx',
      'src/Button.stories.tsx',
      'src/app/page.tsx',
    ])!;
    const comp = r.matched.find((m) => m.patternId === 'FE-component-files');
    expect(comp).toBeDefined();
    expect(comp!.evidence).toContain('1 component');
  });

  it('matches FE-components-dir only when a components/ dir exists', () => {
    const withDir = run(['src/components/X.tsx'])!;
    const without = run(['src/widgets/X.tsx'])!;
    expect(withDir.matched.some((m) => m.patternId === 'FE-components-dir')).toBe(true);
    expect(without.matched.some((m) => m.patternId === 'FE-components-dir')).toBe(false);
  });

  it('matches FE-hooks for useX files and for a hooks/ dir', () => {
    const useFile = run(['src/X.tsx', 'src/useThing.ts'])!;
    const hooksDir = run(['src/X.tsx', 'src/hooks/index.ts'])!;
    const noHooks = run(['src/X.tsx', 'src/util.ts'])!;
    expect(useFile.matched.some((m) => m.patternId === 'FE-hooks')).toBe(true);
    expect(hooksDir.matched.some((m) => m.patternId === 'FE-hooks')).toBe(true);
    expect(noHooks.matched.some((m) => m.patternId === 'FE-hooks')).toBe(false);
  });

  it('matches FE-typescript-adoption when tsx outnumbers jsx', () => {
    const ts = run(['src/A.tsx', 'src/B.tsx', 'src/C.jsx'])!;
    expect(ts.matched.some((m) => m.patternId === 'FE-typescript-adoption')).toBe(true);
  });

  it('matches FE-typescript-adoption via tsconfig even with jsx-heavy code', () => {
    const r = run(['tsconfig.json', 'src/A.jsx', 'src/B.jsx', 'src/C.jsx'])!;
    expect(r.matched.some((m) => m.patternId === 'FE-typescript-adoption')).toBe(true);
  });

  it('does NOT match FE-typescript-adoption for jsx-only with no tsconfig', () => {
    const r = run(['src/A.jsx', 'src/B.jsx'])!;
    expect(r.matched.some((m) => m.patternId === 'FE-typescript-adoption')).toBe(false);
  });

  it('satisfies css-modularity with tailwind alone (no CSS modules)', () => {
    const r = run(['src/A.tsx', 'tailwind.config.js'])!;
    const css = r.matched.find((m) => m.patternId === 'FE-css-modularity');
    expect(css).toBeDefined();
    expect(css!.evidence).toContain('tailwind');
  });

  it('satisfies css-modularity with *.module.css', () => {
    const r = run(['src/A.tsx', 'src/A.module.css'])!;
    expect(r.matched.some((m) => m.patternId === 'FE-css-modularity')).toBe(true);
  });

  it('matches FE-design-system for *.stories or .storybook', () => {
    const stories = run(['src/A.tsx', 'src/A.stories.tsx'])!;
    const sb = run(['src/A.tsx', '.storybook/main.ts'])!;
    expect(stories.matched.some((m) => m.patternId === 'FE-design-system')).toBe(true);
    expect(sb.matched.some((m) => m.patternId === 'FE-design-system')).toBe(true);
  });

  it('flags FE-global-css-only (RISK) for a lone global stylesheet', () => {
    const r = run(['src/A.tsx', 'src/globals.css'])!;
    const risk = r.matched.find((m) => m.patternId === 'FE-global-css-only');
    expect(risk).toBeDefined();
    expect(risk!.scoreImpact).toBeLessThan(0);
  });

  it('does NOT flag FE-global-css-only when CSS modules also exist', () => {
    const r = run(['src/A.tsx', 'src/globals.css', 'src/A.module.css'])!;
    expect(r.matched.some((m) => m.patternId === 'FE-global-css-only')).toBe(false);
  });

  it('flags FE-monolithic-components when many pages but few components', () => {
    const r = run(['src/App.tsx'], { pageCount: 10 })!;
    const risk = r.matched.find((m) => m.patternId === 'FE-monolithic-components');
    expect(risk).toBeDefined();
    expect(risk!.scoreImpact).toBeLessThan(0);
  });

  it('does NOT flag FE-monolithic-components when pageCount is absent', () => {
    const r = run(['src/App.tsx'])!;
    expect(r.matched.some((m) => m.patternId === 'FE-monolithic-components')).toBe(false);
  });

  it('surfaces componentFeatureCount in component-file evidence when supplied', () => {
    const r = run(['src/A.tsx'], { componentFeatureCount: 3 })!;
    const comp = r.matched.find((m) => m.patternId === 'FE-component-files');
    expect(comp!.evidence).toContain('3 component feature');
  });
});
