---
name: next-actions-2026-05-26
description: 다음 세션 즉시 시작 액션 큐. 현재 main HEAD는 b43ba21 (PR
metadata: 
  node_type: memory
  type: project
  originSessionId: 013ed79c-4b70-4cbc-84bb-cb9c8f3f9875
---

# 다음 세션 즉시 시작 — Phase 1 Quick Wins

**PRD**: `docs/PRD/audit-quality-roadmap-2026-05-26.md` (반드시 먼저 읽기)
**Why**: ClearToShip audit 12 카테고리 중 7개 N/A. Claude-BugHunter 벤치마킹 결과를 단계적 PR로 적용. 사용자 피드백 ground truth: "너무 N/A가 많은거 아니야? LLM을 쓰고 있는데"

## 시작 전 (1회)

```bash
bash scripts/sync-claude-memory.sh   # or PowerShell .ps1
git checkout main && git pull --ff-only
git log --oneline -5
# expect: b43ba21 fix(static-analysis): use p/owasp-top-ten config (#55)
```

## Phase 1 — 3개 PR, 약 1주

### 1. 7-Question Gate (LAUNCH_READINESS verdict)
**Branch**: `feat/launch-verdict-7q-gate`
**Spec**: PRD §4.1
**Effort**: S (1-2일)

핵심 파일:
- `packages/audit-core/src/launch-gate/seven-question-gate.ts` (NEW)
- `packages/audit-core/src/launch-gate/seven-question-gate.test.ts`
- `packages/shared-types/src/launch-gate.ts` (zod)
- `apps/web/components/dashboard/launch-verdict-chip.tsx` (NEW)
- `packages/audit-core/src/scoring/calculate-scores.ts` (verdict 통합)

7 questions + verdict 모델은 PRD §4.1 그대로. Verdict: READY / CONDITIONAL / BLOCK / FIX_FIRST.

### 2. CVE/KEV refresh script (F bucket)
**Branch**: `feat/cve-coverage-refresh`
**Spec**: PRD §4.2
**Effort**: S (2-3일)

- `scripts/refresh-osv-coverage.py` — stdlib Python (Claude-BugHunter `refresh-cve-index.py` 패턴)
- `.github/workflows/refresh-cve-coverage.yml` — weekly cron
- `reports/CVE-COVERAGE/.gitkeep`

### 3. Inventory→score baseline (원래 "1번 작업")
**Branch**: `feat/inventory-baseline-scoring`
**Spec**: PRD §4.3
**Effort**: S (2-3일)

- `packages/audit-core/src/scoring/calculate-scores.ts` 수정
- `packages/audit-core/src/scoring/inventory-scoring.ts` 확장

Baseline rules (PRD §4.3 그대로):
- `routeInventory.routes.length > 0` → FEATURE_GRAPH = 50
- `routeInventory.routes.length > 5 && Link edges` → FEATURE_GRAPH = 70
- `dataModelInventory.tech !== 'none'` → DATA_MODEL = 60
- `entities.length >= 3` → DATA_MODEL = 75
- `dynamicRouteCount > 0 && pageCount > 0` → FUNCTIONAL_FLOW = 50

## Phase 1 deliverable

4개 카테고리 N/A 해소:
- FEATURE_GRAPH (N/A → 50-70)
- FUNCTIONAL_FLOW (N/A → 50)
- DATA_MODEL (N/A → 60-75)
- LAUNCH_READINESS (100 + verdict)

측정 카테고리 5→9 (75% coverage).

## Phase 2/3는 PRD §5/§6 참조. Phase 1 머지 후 시작.

## 미해결 결정 (다음 세션 시작 시 확인)

PRD §10 Open Questions L1-L6 참조. 권장 default 있으므로 별 결정 없이 시작 가능.

## 현재 prod 상태 (2026-05-26 세션 종료 시점)

- main HEAD: **b43ba21** (PR #55 머지 후)
- audit-worker revision: 새 deploy 적용됨 (PR #55 + PR #54)
- 최근 머지 PR 히스토리 (시간순):
  - #38 Phase 1 worker tooling (semgrep + osv) — MERGED
  - #50 Phase G MVP (RepoTreeView + PageCard grid) — MERGED
  - #51 LSP Phase A (infra + Symbol Inventory) — MERGED
  - #52 typescript-language-server install — MERGED then REVERTED
  - #53 PR #52 revert (LSP crash) — MERGED
  - #54 SYMBOL_INVENTORY step disable (spawn ENOENT) — MERGED
  - #55 semgrep --config=p/owasp-top-ten — MERGED
- LSP backbone (PR #51 코드) 상태:
  - SYMBOL_INVENTORY step **registry에서 제거됨** (PR #54). 코드는 그대로 있고 step만 disable
  - typescript-language-server install **revert됨** (PR #53)
  - lsp-backend hotfix Task #14는 silent 상태 — Phase 1 완료 후 또는 별 요청 시 재시도
- Stuck audits (모두 manual BLOCKED): 0KQJN..., OIVTQ..., kNu1r...
- 최근 성공 audit: `oVfSwI54JWtFO0GJxbn7` (commitHash b43ba21, readinessScore 85, status READY, 5/12 카테고리 측정됨)

## Cloud Run / GCP cheatsheet

- Active gcloud account: `heechang1988@gmail.com` (Owner of cleartoship-prod)
- 만료 시: `gcloud auth login heechang1988@gmail.com`
- Project: `gcloud config set project cleartoship-prod`
- Region: `asia-northeast3`
- Services:
  - `audit-worker`: https://audit-worker-t4fpcxe2ha-du.a.run.app (OIDC 보호)
  - `web-ssr`: https://web-ssr-t4fpcxe2ha-du.a.run.app (public)
- Audit cancel (Firestore manual update):
  ```bash
  TOKEN=$(gcloud auth print-access-token)
  curl -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    "https://firestore.googleapis.com/v1/projects/cleartoship-prod/databases/(default)/documents/auditRuns/<ID>?updateMask.fieldPaths=status&updateMask.fieldPaths=errorMessage&updateMask.fieldPaths=completedAt" \
    -d '{"fields":{"status":{"stringValue":"BLOCKED"},...}}'
  ```

## /healthz GFE 404 (parked)

PR #40 bypass — POST /run probe로 검증. 미스터리 자체는 unsolved이지만 deploy 통과. Phase 2 polish.

## Related memories

- [[claude-bughunter-benchmarking-2026-05-26-analysis]] — 본 PRD의 source analysis (repo-benchmarker)
- [[setuptools-82-pkg-resources-removal]] — Phase 1 (PR #38) burnt-in
- [[feedback-pipx-python-docker]] — PR #38 prereqs
- [[feedback-gcloud-iam-wif]] — Cloud Run IAM / WIF burnt-in
- [[feedback-pnpm-monorepo-docker]] — original Phase 0 burnt-in
- [[project-visual-audit-vision]] — V1/V2/V3 visual axis (orthogonal)
- [[project-phase0-status]] — Phase 0 verified state
