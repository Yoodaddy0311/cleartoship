# Audit Pattern Library — Maintainability & Documentation

> Category: `MAINTAINABILITY_DOCUMENTATION` · Origin: `D` (deterministic) ·
> Source module: `packages/audit-core/src/patterns/maintainability-patterns.ts`

## Overview

**What it measures.** How easy the project is for a future contributor to pick
up, extend, and operate safely — proxied by the presence of the documentation,
test, CI, and tooling scaffolding that healthy projects carry.

**Why it matters.** Vibe-coded projects routinely ship with working features but
no README, no tests, and no lint/format config. Such a project may *run*, but it
is expensive and risky to change. Maintainability surfaces that hidden debt to
the founder before launch.

**Scoring logic.** This is a Pattern-Library category (Roadmap §5.5): start from
a `baseline` of 50, then add/subtract a fixed `scoreImpact` for each pattern that
matches. README and a tests directory carry the heaviest positive weights; the
*absence* of tests is modeled as its own negative pattern (`MNT-no-tests`)
because tests are the single strongest maintainability predictor. The aggregate
is clamped to 0–100. Confidence is `HIGH` because the module always evaluates
≥5 patterns (well above the §5.5 HIGH threshold). The category returns `null`
(stays **N/A**) only when the file tree is empty, i.e. the clone/inspection
failed.

**Inputs (prod-available only).**
- `fileTree` — repo-relative POSIX file paths from `state.fileTree`.
- W1-A launch-readiness booleans: `README_PRESENT`, `TESTS_DIR_PRESENT`,
  `CI_CONFIG_PRESENT`, `LICENSE_PRESENT`, `PACKAGE_SCRIPTS_PRESENT`.

**Explicitly deferred (NOT scored here).** LOC-per-file, cyclomatic / cognitive
complexity, actual test-coverage %, and commit-message quality. The roadmap
§5.3 lists these as the eventual maintainability signals, but every one of them
requires reading **file contents** or **git history**. This deterministic pass
reads neither — it only sees a path list and boolean markers — so scoring those
here would be fabrication. They are deferred to a future content-reading /
git-log pass and intentionally omitted to keep the score honest.

## Patterns

Twelve positive presence signals plus one risk signal (13 total). All are pure
checks over `fileTree` paths and the W1-A booleans — no file contents, no git
log, no network, no LLM.

### MNT-readme
- **When to suspect**: project has no entry-point documentation.
- **Test (deterministic signal)**: W1-A `README_PRESENT`.
- **Validation**: matched when `hasReadme` is true.
- **Score impact**: +14 (heaviest doc signal).

### MNT-tests
- **When to suspect**: code ships with no automated tests.
- **Test (deterministic signal)**: W1-A `TESTS_DIR_PRESENT`.
- **Validation**: matched when `hasTests` is true.
- **Score impact**: +16 (heaviest positive — tests are the strongest signal).

### MNT-ci
- **When to suspect**: no automated build/test gate on changes.
- **Test (deterministic signal)**: W1-A `CI_CONFIG_PRESENT`.
- **Validation**: matched when `hasCiConfig` is true.
- **Score impact**: +8.

### MNT-license
- **When to suspect**: legal ambiguity about reuse/contribution.
- **Test (deterministic signal)**: W1-A `LICENSE_PRESENT`.
- **Validation**: matched when `hasLicense` is true.
- **Score impact**: +4.

### MNT-package-scripts
- **When to suspect**: no canonical build/test/dev entry points.
- **Test (deterministic signal)**: W1-A `PACKAGE_SCRIPTS_PRESENT`.
- **Validation**: matched when `hasPackageScripts` is true.
- **Score impact**: +6.

### MNT-docs-dir
- **When to suspect**: documentation beyond the README is missing.
- **Test (deterministic signal)**: a path equals `docs` or starts with `docs/`.
- **Validation**: matched when a top-level `docs/` directory exists. A file
  merely containing the substring "docs" (e.g. `src/docsHelper.ts`) does **not**
  match.
- **Score impact**: +7.

### MNT-changelog
- **When to suspect**: release history is undocumented.
- **Test (deterministic signal)**: a **root-level** file whose basename starts
  with `changelog` (case-insensitive).
- **Validation**: matched for root `CHANGELOG*`; a nested
  `packages/a/CHANGELOG.md` does not count.
- **Score impact**: +5.

### MNT-contributing
- **When to suspect**: no onboarding guidance for contributors.
- **Test (deterministic signal)**: a **root-level** file whose basename starts
  with `contributing` (case-insensitive).
- **Validation**: matched for root `CONTRIBUTING*`.
- **Score impact**: +4.

### MNT-typescript-config
- **When to suspect**: untyped JS codebase (harder to refactor safely).
- **Test (deterministic signal)**: any path whose basename starts with
  `tsconfig` and ends with `.json` (any depth).
- **Validation**: matched for `tsconfig.json`, `tsconfig.build.json`, etc.
- **Score impact**: +6.

### MNT-formatter-linter
- **When to suspect**: inconsistent style, no automated quality enforcement.
- **Test (deterministic signal)**: any path whose basename is a known formatter/
  linter config — `.prettierrc*`, `.eslintrc*`, `eslint.config.*`, or
  `biome.json` / `biome.jsonc`.
- **Validation**: matched when at least one such config exists.
- **Score impact**: +6.

### MNT-editorconfig
- **When to suspect**: editor settings drift across contributors.
- **Test (deterministic signal)**: a path with basename `.editorconfig`.
- **Validation**: matched when present.
- **Score impact**: +2 (small).

### MNT-gitignore
- **When to suspect**: build artifacts / secrets at risk of being committed.
- **Test (deterministic signal)**: a path with basename `.gitignore`.
- **Validation**: matched when present.
- **Score impact**: +2 (small).

### MNT-no-tests (RISK)
- **When to suspect**: the project has no tests at all.
- **Test (deterministic signal)**: W1-A `TESTS_DIR_PRESENT` is false.
- **Validation**: matched when `hasTests` is false.
- **Score impact**: −18 (the one real penalty — compounds with the loss of the
  `MNT-tests` +16, so a test-less repo is pushed sharply down).

## Score formula

```
score = clamp( 50                                       (baseline)
             + 14  if MNT-readme            (hasReadme)
             + 16  if MNT-tests             (hasTests)
             +  8  if MNT-ci                (hasCiConfig)
             +  4  if MNT-license           (hasLicense)
             +  6  if MNT-package-scripts   (hasPackageScripts)
             +  7  if MNT-docs-dir          (docs/ in fileTree)
             +  5  if MNT-changelog         (root CHANGELOG*)
             +  4  if MNT-contributing      (root CONTRIBUTING*)
             +  6  if MNT-typescript-config (tsconfig*.json)
             +  6  if MNT-formatter-linter  (prettier/eslint/biome config)
             +  2  if MNT-editorconfig      (.editorconfig)
             +  2  if MNT-gitignore         (.gitignore)
             - 18  if MNT-no-tests          (NOT hasTests)
             , 0, 100 )
```

**Reference points.**
- Fully documented + tested + configured repo: `50 + 80 = 130 → clamped 100`
  (well above the ≥80 "healthy" band).
- Bare repo (all W1-A false, a couple of source files): only the `MNT-no-tests`
  risk matches → `50 − 18 = 32` (inside the 25–40 "needs work" band).

Returns `null` (→ category stays **N/A**) only when `fileTree` is empty.
