import {
  scoreFromPatterns,
  type PatternEvidence,
  type PatternScoreResult,
} from './score-from-patterns.js';

/**
 * Audit Quality Roadmap §5.3 — MAINTAINABILITY_DOCUMENTATION Pattern Library.
 *
 * The category was previously N/A (no `measuredBy` pipeline step). This module
 * gives it a deterministic Pattern-Library score (origin 'D') from signals that
 * are *always* available in prod: the cloned repo's file tree (path list only)
 * plus the W1-A launch-readiness boolean markers.
 *
 * HONESTY CONSTRAINT: a file-path list cannot reveal LOC-per-file, cyclomatic
 * complexity, test coverage %, or commit-message quality — those need file
 * contents or git history, which this pass deliberately does NOT read. We only
 * score presence/structure signals here; the deeper metrics are deferred to a
 * later content-reading pass (see docs/audit-patterns/maintainability.md).
 */

export interface MaintainabilitySignals {
  /** Repo-relative POSIX file paths (state.fileTree). */
  readonly fileTree: ReadonlyArray<string>;
  /** W1-A README_PRESENT. */
  readonly hasReadme: boolean;
  /** W1-A TESTS_DIR_PRESENT. */
  readonly hasTests: boolean;
  /** W1-A CI_CONFIG_PRESENT. */
  readonly hasCiConfig: boolean;
  /** W1-A LICENSE_PRESENT. */
  readonly hasLicense: boolean;
  /** W1-A PACKAGE_SCRIPTS_PRESENT. */
  readonly hasPackageScripts: boolean;
}

/** Score impacts (§5.2). README + tests are the heaviest healthy signals; the
 * absence of tests is the one real penalty (tests are the strongest
 * maintainability predictor). Tuned so a fully-documented/tested/configured
 * repo lands ~80–90 and a bare repo lands ~25–40 off a baseline of 50. */
const IMPACT = {
  readme: 14,
  tests: 16,
  ci: 8,
  license: 4,
  packageScripts: 6,
  docsDir: 7,
  changelog: 5,
  contributing: 4,
  tsconfig: 6,
  formatterLinter: 6,
  editorconfig: 2,
  gitignore: 2,
  noTestsRisk: -18,
} as const;

/** Lowercased basename of a POSIX repo-relative path. */
function basename(path: string): string {
  const parts = path.split('/');
  return (parts[parts.length - 1] ?? '').toLowerCase();
}

/** True when any root-level file's basename matches the predicate. A "root"
 * file has no `/` in its repo-relative path. */
function hasRootFile(
  fileTree: ReadonlyArray<string>,
  matches: (name: string) => boolean,
): boolean {
  return fileTree.some((path) => !path.includes('/') && matches(basename(path)));
}

/** True when any path's basename (at any depth) matches the predicate. */
function hasAnyFile(
  fileTree: ReadonlyArray<string>,
  matches: (name: string) => boolean,
): boolean {
  return fileTree.some((path) => matches(basename(path)));
}

/** True when a top-level `docs/` directory is present in the tree. */
function hasDocsDir(fileTree: ReadonlyArray<string>): boolean {
  return fileTree.some(
    (path) => path === 'docs' || path.startsWith('docs/'),
  );
}

const FORMATTER_LINTER_NAMES = new Set([
  'biome.json',
  'biome.jsonc',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc.yaml',
]);

function isFormatterLinterConfig(name: string): boolean {
  if (FORMATTER_LINTER_NAMES.has(name)) return true;
  if (name.startsWith('.prettierrc')) return true;
  if (name.startsWith('eslint.config.')) return true;
  return false;
}

function ev(matched: boolean, whenTrue: string, whenFalse: string): string {
  return matched ? whenTrue : whenFalse;
}

/** Build the deterministic pattern set from the signals (12 positive presence
 * signals + 1 risk signal). */
function buildPatterns(
  signals: MaintainabilitySignals,
): ReadonlyArray<PatternEvidence> {
  const { fileTree } = signals;
  const docsDir = hasDocsDir(fileTree);
  const changelog = hasRootFile(fileTree, (n) => n.startsWith('changelog'));
  const contributing = hasRootFile(fileTree, (n) => n.startsWith('contributing'));
  const tsconfig = hasAnyFile(
    fileTree,
    (n) => n.startsWith('tsconfig') && n.endsWith('.json'),
  );
  const formatterLinter = hasAnyFile(fileTree, isFormatterLinterConfig);
  const editorconfig = hasAnyFile(fileTree, (n) => n === '.editorconfig');
  const gitignore = hasAnyFile(fileTree, (n) => n === '.gitignore');

  return [
    {
      patternId: 'MNT-readme',
      matched: signals.hasReadme,
      scoreImpact: IMPACT.readme,
      evidence: ev(signals.hasReadme, 'README present', 'no README detected'),
    },
    {
      patternId: 'MNT-tests',
      matched: signals.hasTests,
      scoreImpact: IMPACT.tests,
      evidence: ev(signals.hasTests, 'tests directory present', 'no tests directory'),
    },
    {
      patternId: 'MNT-ci',
      matched: signals.hasCiConfig,
      scoreImpact: IMPACT.ci,
      evidence: ev(signals.hasCiConfig, 'CI config present', 'no CI config'),
    },
    {
      patternId: 'MNT-license',
      matched: signals.hasLicense,
      scoreImpact: IMPACT.license,
      evidence: ev(signals.hasLicense, 'LICENSE present', 'no LICENSE'),
    },
    {
      patternId: 'MNT-package-scripts',
      matched: signals.hasPackageScripts,
      scoreImpact: IMPACT.packageScripts,
      evidence: ev(
        signals.hasPackageScripts,
        'package.json scripts present',
        'no package.json scripts',
      ),
    },
    {
      patternId: 'MNT-docs-dir',
      matched: docsDir,
      scoreImpact: IMPACT.docsDir,
      evidence: ev(docsDir, 'docs/ directory present', 'no docs/ directory'),
    },
    {
      patternId: 'MNT-changelog',
      matched: changelog,
      scoreImpact: IMPACT.changelog,
      evidence: ev(changelog, 'CHANGELOG file at root', 'no CHANGELOG at root'),
    },
    {
      patternId: 'MNT-contributing',
      matched: contributing,
      scoreImpact: IMPACT.contributing,
      evidence: ev(
        contributing,
        'CONTRIBUTING file at root',
        'no CONTRIBUTING at root',
      ),
    },
    {
      patternId: 'MNT-typescript-config',
      matched: tsconfig,
      scoreImpact: IMPACT.tsconfig,
      evidence: ev(tsconfig, 'tsconfig*.json present (typed codebase)', 'no tsconfig'),
    },
    {
      patternId: 'MNT-formatter-linter',
      matched: formatterLinter,
      scoreImpact: IMPACT.formatterLinter,
      evidence: ev(
        formatterLinter,
        'formatter/linter config present',
        'no formatter/linter config',
      ),
    },
    {
      patternId: 'MNT-editorconfig',
      matched: editorconfig,
      scoreImpact: IMPACT.editorconfig,
      evidence: ev(editorconfig, '.editorconfig present', 'no .editorconfig'),
    },
    {
      patternId: 'MNT-gitignore',
      matched: gitignore,
      scoreImpact: IMPACT.gitignore,
      evidence: ev(gitignore, '.gitignore present', 'no .gitignore'),
    },
    {
      patternId: 'MNT-no-tests',
      matched: !signals.hasTests,
      scoreImpact: IMPACT.noTestsRisk,
      evidence: ev(
        !signals.hasTests,
        'RISK: no tests directory — weakest maintainability signal',
        'tests present (no penalty)',
      ),
    },
  ];
}

/**
 * Returns null only when fileTree is empty (clone failed / no inspection) — then
 * the category stays N/A. Otherwise always returns a PatternScoreResult
 * (maintainability is assessable whenever there are files).
 */
export function scoreMaintainability(
  signals: MaintainabilitySignals,
): PatternScoreResult | null {
  if (signals.fileTree.length === 0) {
    return null;
  }
  return scoreFromPatterns(buildPatterns(signals));
}
