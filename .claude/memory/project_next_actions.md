---
name: project-next-actions
description: Ordered action queue for the next ClearToShip session — PR-A4 (scoring + UI badges) is next; PR #38 Phase 1 is the stalled side-quest. Updated 2026-05-21.
metadata:
  type: project
---

# Next session action queue — 2026-05-21 (updated)

Source-driven extraction Phase A is **mostly shipped**:
- ✅ PR #41 — PRD (3-bucket framework D/F/L)
- ✅ PR #42 — A1 GitHub metadata expansion (description, topics, languages, stars, releases, license)
- ✅ PR #43 — A2 DataModelInventory (Prisma + Firestore multi-stack)
- ✅ PR #44 — A3 RouteInventory (Next.js App + Pages Router with segments + exportedMethods)

All three inventories (`state.repoMetadata`, `state.dataModelInventory`, `state.routeInventory`) are plumbed into `PipelineState` and ready to consume — **but scoring still doesn't read them**. The 영역별 점수 categories that should now show numbers (기능 관계도, 데이터 모델, 일부 제품 의도) are still N/A in the UI because the scoring step + UI never got wired up. PR-A4 closes that loop.

**Why**: today's prod self-audit STILL returns 7 N/A categories despite the inventory data being available. Scoring + UI consumption is the visible payoff for the last three PRs.

**How to apply**: open the session in this branch state, read the linked memories first, then attack PR-A4. PR #38 (Phase 1 worker tooling) is the stalled side-quest — owner can decide whether to retry the semgrep install with the burnt-in lessons or punt to a separate session.

## Task 1 — PR-A4: Scoring step consumption + UI score-origin badges

**Status**: Not started. All three inventory data sources merged on main (PR #42, #43, #44). The scoring step (`packages/audit-core/src/scoring/`) needs to read them.

**Required reading first**:
- `docs/PRD/source-driven-extraction-2026-05-20.md` §6 (UI changes) + §7.1 (PR split).
- `packages/shared-types/src/{repo-metadata,data-model-inventory,route-inventory}.ts` — the three schemas the scoring step will read.

**Scope**:
1. Extend the scoring step to consume the three inventories:
   - `기능 관계도` — driven by `state.routeInventory.counts.{pages,apis,dynamic}` + counts.byFramework
   - `데이터 모델` — driven by `state.dataModelInventory.{tech,entities}`
   - `제품 의도` — partial credit from `state.repoMetadata.{description,topics,license}` (full credit waits for B1)
2. Each category score carries a D/F/L origin attribution (PRD §6 badge spec).
3. UI: `apps/web/components/dashboard/category-grid.tsx` — render the origin badge (📦 D / 🌐 F / 🤖 L) per score.
4. UI: N/A fallback copy gets per-category specificity (similar to PR #39's SKIP-message rewrite).
5. Tests: scoring step contract + UI snapshot for the new badge.

**Estimated size**: ~400 LOC. Same shape as PR #39's SKIP-reason fix (data flow already plumbed; just consumption + presentation).

**Verification**: after merge, re-run a cleartoship self-audit. Expected:
- 기능 관계도 → score > 0 (not N/A); UI shows "📦 23 pages, 17 API endpoints"
- 데이터 모델 → score > 0 (Firestore detected); UI shows "📦 5 collections"
- 제품 의도 → score > 0 (GitHub metadata); UI shows "🌐 description + 3 topics"

## Task 2 — PR #38 Phase 1 worker tooling (stalled)

**Status**: 5 commits pushed. Docker build keeps failing on the `semgrep` install. 4 attempts so far:
1. plain pipx → `pkg_resources` missing
2. + `python3-setuptools` apt → still missing
3. + `pipx inject semgrep setuptools pip` → still missing
4. switched to `python3 -m venv /opt/semgrep-venv` → new failure: `pysemgrep` OCaml binary not found

**Required reading first**:
- `.claude/memory/feedback_pipx_python_docker.md` (committed on PR #38 branch — sync first) — captures the 5 burnt-in pipx + Python + Docker rules.

**Recommended next fix attempt**:
Switch to a `FROM returntocorp/semgrep:1.86.0 AS semgrep-stage` multi-stage in the Dockerfile and `COPY --from=semgrep-stage /usr/local/bin/semgrep /usr/local/bin/pysemgrep ... /opt/semgrep-venv/` so the OCaml binary + the Python launcher come pre-built from the official image. Sidesteps the "wheel doesn't bundle the OCaml binary on this base" question.

If that fails: punt to a different scanner (`gitleaks` already supported per the partial-results banner) and defer semgrep until 1.90+.

## Task 3 — `/healthz` GFE 404 mystery (parked)

PR #40 bypass works in prod — deploys go through. The mystery itself is unsolved but no longer blocks shipping. Treat as a Phase 2 polish item unless someone has a real lead.

## Task 4 — PR-A3b follow-up (Express + Vue/Remix/SvelteKit)

PR-A3 shipped Next.js App + Pages Router only. Express/Fastify/Hono handler AST scan needs `ts-morph` (not yet a workspace dep). Same module structure as `packages/audit-core/src/feature-graph/route-ast/` — add `express-handlers.ts`, `vue-router.ts`, etc. Estimated ~600 LOC including ts-morph dep + Dockerfile rebuild.

## Task 5 — PR-A2b follow-up (Drizzle + SQL + Mongoose)

PR-A2 shipped Prisma + Firestore. Drizzle (`pgTable` / `mysqlTable` / `sqliteTable`), SQL migration `CREATE TABLE` parser, and Mongoose `mongoose.Schema()` belong in a follow-up. Reuse the inventory schema. ~400 LOC.

## Task 6 — Phase B (LLM)

Blocked on Q1-Q6 decisions from PRD §9 (LLM provider, cache storage, per-audit cost cap, GitHub auth, user notice, opt-out default). Best to settle these inline with a small ADR-style memo before opening PR-B1.

## Useful commands cached from 2026-05-20

Active gcloud account for cleartoship-prod: `heechang1988@gmail.com` (Owner). Re-auth with `gcloud auth login heechang1988@gmail.com` if token expired.

```powershell
# Traffic rollback (proven working 2026-05-20):
gcloud run services update-traffic audit-worker `
  --region=asia-northeast3 --project=cleartoship-prod `
  --to-revisions=audit-worker-00026-srx=100

# Re-tag verify on a specific revision for tagged-URL probing:
gcloud run services update-traffic audit-worker `
  --region=asia-northeast3 --project=cleartoship-prod `
  --set-tags=verify=<revision-name> --to-revisions=<current>=100
```

Note: the post-deploy `/healthz` probe still 404s through GFE; use `POST /run` with `{}` body + the impersonated ID token to confirm worker reachability after a deploy. deploy.yml smoke step already does this.

## Related memories

- [[project_phase0_status]] — Phase 0 verified state (score 54)
- [[project_visual_audit_vision]] — V1/V2/V3 visual axis (orthogonal to Source-driven Phase A)
- [[feedback_pipx_python_docker]] — PR #38 prereqs (on PR #38 branch — sync via `scripts/sync-claude-memory.{sh,ps1}`)
- [[feedback_gcloud_iam_wif]] — Cloud Run IAM / WIF burnt-in (on PR #38 branch)
- [[feedback_pnpm_monorepo_docker]] — original Phase 0 burnt-in
