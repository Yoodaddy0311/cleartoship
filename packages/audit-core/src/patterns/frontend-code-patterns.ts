import {
  scoreFromPatterns,
  type PatternEvidence,
  type PatternScoreResult,
} from './score-from-patterns.js';

/**
 * Audit Quality Roadmap §5.3 — FRONTEND_CODE Pattern Library.
 *
 * Today FRONTEND_CODE is N/A (no `measuredBy` step produces it). This module
 * gives it a deterministic Pattern-Library score from signals the pipeline
 * already has: the cloned repo's file *tree* (POSIX paths) plus two optional
 * corroborating counts. It NEVER reads file contents, never calls an LLM, and
 * never touches the network — every pattern is inferable from file PATHS alone,
 * so the origin stays 'D'.
 *
 * Returns `null` when the repo has no frontend code at all (no component / JSX /
 * SFC files): the category honestly stays N/A ("no frontend detected") rather
 * than emitting a spurious 50.
 */

export interface FrontendCodeSignals {
  /** Repo-relative POSIX file paths (state.fileTree). */
  readonly fileTree: ReadonlyArray<string>;
  /** Count of detectedFeatures whose type === 'component' (optional). */
  readonly componentFeatureCount?: number;
  /** routeInventory.counts.pages (optional). */
  readonly pageCount?: number;
}

/** A path that is a frontend *source* file (component candidate). */
const COMPONENT_EXT = /\.(tsx|jsx|vue|svelte)$/;
/** Files that look like components by extension but are NOT real components. */
const NON_COMPONENT = /\.(test|spec|stories)\.[^/]+$/;
/** Next.js / Remix style route files that are not reusable components. */
const ROUTE_FILE = /(?:^|\/)(page|layout|route|template|loading|error|not-found)\.(tsx|jsx|ts|js)$/;
/** Custom-hook file naming: useFoo.ts / useBar.tsx. */
const HOOK_FILE = /(?:^|\/)use[A-Z][A-Za-z0-9]*\.(ts|tsx)$/;
/** Test/spec files written for a component. */
const COMPONENT_TEST = /\.(test|spec)\.(tsx|jsx)$/;
/** CSS-module / Sass-module styling. */
const CSS_MODULE = /\.module\.(css|scss|sass|less)$/;
/** A single global stylesheet (the "one big CSS file" smell). */
const GLOBAL_CSS = /(?:^|\/)(globals?|styles?|main|index|app)\.(css|scss|sass|less)$/;

function dirSegments(path: string): ReadonlyArray<string> {
  return path.split('/');
}

function hasDir(tree: ReadonlyArray<string>, dir: string): boolean {
  return tree.some((p) => dirSegments(p).includes(dir));
}

/** Component source files, excluding tests, stories, and route files. */
function componentFiles(tree: ReadonlyArray<string>): ReadonlyArray<string> {
  return tree.filter(
    (p) =>
      COMPONENT_EXT.test(p) && !NON_COMPONENT.test(p) && !ROUTE_FILE.test(p) && !p.includes('/pages/') && !p.startsWith('pages/'),
  );
}

/** Build the deterministic evidence list. Pure: derives everything from paths. */
function buildPatterns(
  signals: FrontendCodeSignals,
  components: ReadonlyArray<string>,
): ReadonlyArray<PatternEvidence> {
  const { fileTree, componentFeatureCount, pageCount } = signals;
  const count = components.length;

  const hooks =
    fileTree.some((p) => HOOK_FILE.test(p)) || hasDir(fileTree, 'hooks');
  const tsxCount = fileTree.filter((p) => p.endsWith('.tsx')).length;
  const jsxCount = fileTree.filter((p) => p.endsWith('.jsx')).length;
  const hasTsconfig = fileTree.some((p) => /(?:^|\/)tsconfig[.\w-]*\.json$/.test(p));
  const cssModules = fileTree.filter((p) => CSS_MODULE.test(p)).length;
  const hasTailwind = fileTree.some((p) => /(?:^|\/)tailwind\.config\.[^/]+$/.test(p));
  const globalCss = fileTree.filter((p) => GLOBAL_CSS.test(p) && !CSS_MODULE.test(p));
  const componentTests = fileTree.filter((p) => COMPONENT_TEST.test(p)).length;
  const hasStorybook =
    hasDir(fileTree, '.storybook') ||
    fileTree.some((p) => /\.stories\.[^/]+$/.test(p)) ||
    hasDir(fileTree, 'design-system') ||
    hasDir(fileTree, 'ui');

  // FE-component-files: scale impact by count (small → +6, healthy → +14).
  const componentImpact = count >= 12 ? 14 : count >= 4 ? 10 : 6;

  // FE-global-css-only RISK: frontend exists but the only styling signal is a
  // single global stylesheet (no modules, no tailwind).
  const globalCssOnly =
    globalCss.length > 0 && cssModules === 0 && !hasTailwind && globalCss.length <= 2;

  // FE-monolithic-components RISK: a large page surface served by very few
  // components — only assessable when pageCount is supplied.
  const monolithic =
    typeof pageCount === 'number' && pageCount >= 6 && count < pageCount / 2;

  const featureCorroborates =
    typeof componentFeatureCount === 'number' && componentFeatureCount > 0;

  return [
    {
      patternId: 'FE-component-files',
      matched: count > 0,
      scoreImpact: componentImpact,
      evidence: `${count} component source file(s) (excl. test/story/route)${featureCorroborates ? `, ${componentFeatureCount} component feature(s)` : ''}`,
    },
    {
      patternId: 'FE-components-dir',
      matched: hasDir(fileTree, 'components'),
      scoreImpact: 6,
      evidence: 'a components/ directory groups reusable UI',
    },
    {
      patternId: 'FE-hooks',
      matched: hooks,
      scoreImpact: 6,
      evidence: 'custom hooks (useX files or hooks/ dir) present',
    },
    {
      patternId: 'FE-typescript-adoption',
      matched: tsxCount > jsxCount || hasTsconfig,
      scoreImpact: 8,
      evidence: `TS adoption (${tsxCount} .tsx vs ${jsxCount} .jsx${hasTsconfig ? ', tsconfig.json' : ''})`,
    },
    {
      patternId: 'FE-css-modularity',
      matched: cssModules > 0 || hasTailwind,
      scoreImpact: 8,
      evidence: hasTailwind
        ? 'tailwind utility styling'
        : `${cssModules} CSS module file(s)`,
    },
    {
      patternId: 'FE-design-system',
      matched: hasStorybook,
      scoreImpact: 7,
      evidence: 'design-system signal (.storybook / *.stories / ui dir)',
    },
    {
      patternId: 'FE-test-colocation',
      matched: componentTests > 0,
      scoreImpact: 7,
      evidence: `${componentTests} colocated component test file(s)`,
    },
    {
      patternId: 'FE-global-css-only',
      matched: globalCssOnly,
      scoreImpact: -8,
      evidence: 'only a single global stylesheet, no CSS modules or tailwind',
    },
    {
      patternId: 'FE-monolithic-components',
      matched: monolithic,
      scoreImpact: -6,
      evidence: `${count} component(s) for ${pageCount} page(s) — likely monolithic pages`,
    },
  ];
}

export function scoreFrontendCode(
  signals: FrontendCodeSignals,
): PatternScoreResult | null {
  const components = componentFiles(signals.fileTree);
  // No frontend code at all → stay N/A (accurate "no frontend detected").
  if (components.length === 0) {
    return null;
  }
  return scoreFromPatterns(buildPatterns(signals, components));
}
