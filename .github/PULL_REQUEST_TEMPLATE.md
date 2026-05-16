## Summary

> What does this PR do, and why? (what problem it solves, what value it adds — not how it works)

<!-- Replace this line with your summary -->

---

## Type

- [ ] `feat` — new feature
- [ ] `fix` — bug fix
- [ ] `refactor` — no behavior change, code restructure
- [ ] `docs` — documentation only
- [ ] `test` — tests added or updated, no production code change
- [ ] `chore` — build, tooling, dependency updates

---

## Test Plan

### Unit tests
- [ ] New tests cover the changed logic
- [ ] No existing tests were skipped (`it.skip` / `test.skip` / `describe.skip`)
- [ ] `pnpm test` passes locally with 0 failures

### Integration / E2E tests
- [ ] Relevant integration tests added or confirmed unaffected
- [ ] Manual smoke test performed on localhost

### Manual verification steps

```
1. 
2. 
3. 
```

---

## Definition-of-Done Checklist

See full criteria: [docs/contributing/definition-of-done.md](../docs/contributing/definition-of-done.md)

- [ ] All requirements from the linked issue/spec are addressed (1:1 mapping)
- [ ] Tests added/updated — 0 skipped tests — `pnpm test` green locally
- [ ] `pnpm type-check` passes with 0 errors
- [ ] `pnpm lint` passes with 0 errors (includes `vitest/no-disabled-tests` rule)
- [ ] No production code change exists without corresponding test coverage
- [ ] This PR description is complete (Summary, Type, Test Plan, Risk all filled in)

---

## Risk and Rollback Plan

**Risk level:** `low` / `medium` / `high`

**What could go wrong:**

<!-- Describe the worst-case failure mode for this change -->

**Rollback plan:**

<!-- How to revert if something goes wrong in production -->
<!-- e.g., "revert this commit", "toggle feature flag X off", "redeploy previous image tag" -->

---

## Screenshots

> Required for UI changes. Delete this section if not applicable.

| Before | After |
|--------|-------|
| <!-- screenshot --> | <!-- screenshot --> |
