# Definition of Done

A task is **Done** when every criterion below is met — no exceptions, no deferrals.

---

## The 5 Criteria

### 1. All requirements from the issue/spec are addressed (1:1)

Every acceptance criterion listed in the issue or spec document maps to at least one code path and at least one test assertion. If a requirement was found to be impossible or out-of-scope, that decision is documented in the PR summary — it is never silently dropped.

**Evidence required:** Link the issue. For each acceptance criterion, state which test or behavior covers it.

---

### 2. Tests added or updated — 0 skips — `pnpm test` green locally

- New behavior is covered by new or updated tests.
- No test file contains `it.skip`, `test.skip`, `describe.skip`, or `xit` for this PR's changes. The ESLint rule `vitest/no-disabled-tests` enforces this at lint time.
- `pnpm test` exits with code 0 on the author's machine before the PR is opened.

**Evidence required:** Paste the final line of `pnpm test` output (e.g., `Test Files 12 passed (12)`).

---

### 3. `pnpm type-check` passes and `pnpm lint` passes

- `pnpm type-check` (runs `tsc --noEmit`) exits with 0 errors.
- `pnpm lint` (runs `next lint` + ESLint) exits with 0 errors.
- `@ts-ignore` and `eslint-disable` comments added in this PR are each accompanied by an explanatory comment and a linked issue for removal.

**Evidence required:** Both commands exit cleanly. Screenshot or log line acceptable.

---

### 4. No production code change without test coverage justifying it

Every line changed in `src/` (or equivalent production paths) is exercised by at least one test. Code that cannot be unit-tested (e.g., top-level Next.js configuration, pure type definitions) is explicitly noted in the PR with the reason.

**Evidence required:** Coverage report (`pnpm test:coverage`) shows no uncovered file introduced by this PR, or the PR notes the justified exceptions.

---

### 5. PR description is complete

The PR template sections are all filled in:
- **Summary** — what and why (not how).
- **Type** — one checkbox selected.
- **Test Plan** — checklist completed, manual steps written.
- **Risk and Rollback Plan** — risk level selected, both fields populated.

A PR with placeholder text ("TBD", "see code", "N/A" without explanation) in any required section does not meet this criterion.

---

## Definition of NOT Done

The following patterns mean the work is **not** done, regardless of how it looks in isolation.

| Anti-pattern | Why it fails |
|---|---|
| `it.skip(...)` or `test.skip(...)` used as a placeholder for a hard-to-write test | Skipped tests mask missing coverage and violate the zero-skip policy. Write the test or delete it and document why in the PR. |
| `// fix later` / `// TODO` comments introduced for known defects in this PR's scope | Deferred debt in newly written code is untracked debt. File an issue, link it in the comment, or fix it now. |
| `console.log` or debug logging left in production code | Debug output pollutes logs and signals the code was not cleaned up before review. |
| `console.error` / `console.warn` left in test files | Test output must be silent on success. Noisy tests hide real failures. |
| Unrelated drive-by changes mixed into the PR | Each PR should be reviewable in isolation. Refactors and fixes unrelated to the stated goal belong in a separate branch. |
| Passing CI while `pnpm test` fails locally | CI green does not override local failure. The author is responsible for confirming both environments pass. |

---

## Quick Reference Checklist (copy into your PR)

```
- [ ] All issue requirements addressed (1:1)
- [ ] 0 skipped tests — pnpm test green locally
- [ ] pnpm type-check passes
- [ ] pnpm lint passes
- [ ] Coverage: no uncovered production lines introduced (or justified)
- [ ] PR description complete (Summary, Type, Test Plan, Risk)
```
