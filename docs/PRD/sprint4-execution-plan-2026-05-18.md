# Sprint 4 Execution Plan — Work Unit 분해 (2026-05-18)

**작성일**: 2026-05-18
**작성자**: w2a-planner (Opus 4.7) — design-only, no code change
**상위 PRD**:
- [finalize-launch-sharpen-2026-05-18.md](./finalize-launch-sharpen-2026-05-18.md) (745줄, §B/§C/§D)
- [finalize-launch-2026-05-18.md](./finalize-launch-2026-05-18.md) (544줄, base)
- [w2a-prd-upload.md](./w2a-prd-upload.md)
- [appendix-A~D](./appendix-A-wireframes.md)
**Sprint 4 기간**: 2026-05-19 ~ 2026-06-05 (16.5 effective day)
**Launch Target**: 2026-06-05

---

## 0. Executive Summary

본 plan은 Sharpen PRD §B (USP 3옵션) / §C (10-block stack) / §D (5-Wave) 를 입력으로 받아 **Sprint 4 work unit 4 트랙 병렬화**를 정의한다.

**핵심 결정**:
- **Wave 1 = Sharpen Cores**: §B.1 (FCS, 1순위 즉시 구현) + §B.2/B.3 (defer 명시 + Phase 5 spec skeleton만 작성) + §C.1/§C.4 (ShipVerdict 7-enum, TopConcerns 재배치) + §D.6 DoD 5건 (D4/D5/U7/U8/U9; D6는 §C.6 CategoryGrid 의존이라 Wave 2로)
- **Wave 2 = P1 7건**: L-P1-1~7. L-P1-6 (Skeleton)은 §C.4 (TopConcerns)와 의존성 있으나 **별도 sub-task로 유지** (Wave 1 §C.4는 컨테이너 구조, L-P1-6은 그 안의 loading state)
- **Wave 3 = Doc + Hardening**: ROADMAP 갱신, schema migration 5-step doc, L-P0-2 infra (Cloud Run min-instance=1 + monitoring), DATA POLICY audit, legal copy review
- **Track 다이어그램**: Track A (Backend Core) / B (UI Surface) / C (QA + Infra) / D (Content + Docs) 4 트랙 6 멤버 매핑
- **Risk Gate 5건**: TDZ + mobile QA + 법무 카피 + schema migration + cross-check 필수
- **Phase 2 dispatch 직전 next task 5건**: T36.NEXT-1 ~ T36.NEXT-5

---

## 1. Wave 1 — Sharpen Cores (2.5d)

### 1.0 범위 명시

Wave 1은 **Sharper Core를 구체적 코드 work unit으로 분해**한다. Sharpen PRD §D.1 (FCS 2d)에 §B.2/§B.3 deferred decision skeleton + §C.1/§C.4 구조를 추가하여 2.5d로 확장한다.

### 1.1 Wave 1 work units (§B.1 FCS — 1순위 즉시 구현)

| ID | 작업 | 담당 agent | 변경/신규 파일 | 의존성 | 신규 테스트 | 예상 LOC |
|---|---|---|---|---|---|---|
| W1.B1.1 | FCSResult 타입 정의 | backend-dev | `packages/shared-types/src/fcs.ts` (신규) | 없음 | 4 (zod schema valid/invalid) | ~30 |
| W1.B1.2 | computeFCS 알고리즘 구현 | backend-dev | `packages/audit-core/src/fcs/compute-fcs.ts` (신규) | W1.B1.1 | 12 (snapshot 6 + property 6) | ~120 |
| W1.B1.3 | calculate-scores 통합 | backend-fixer | `packages/audit-core/src/calculate-scores.ts` (edit) | W1.B1.2 | 3 (weight invariant 유지 + fcs 필드 포함) | ~25 (delta) |
| W1.B1.4 | severity/confidence weight constants | backend-dev | `packages/audit-core/src/fcs/weights.ts` (신규) | W1.B1.1 | 2 (constants snapshot) | ~20 |
| W1.B1.5 | deriveLaunchStatus 7-enum tree | backend-dev | `packages/audit-core/src/fcs/derive-status.ts` (신규) | W1.B1.4 | 7 (per status branch) | ~50 |
| W1.B1.6 | renderRationale i18n template | backend-dev | `packages/audit-core/src/fcs/render-rationale.ts` (신규) | W1.B1.5 | 4 (ko/en × 2 status sample) | ~40 |
| W1.B1.7 | FCS UI gauge + uncertainty bar | ui-builder | `apps/web/components/founder-confidence-score.tsx` (신규) | W1.B1.1 | 3 (snapshot + axe + 360px) | ~150 |
| W1.B1.8 | FCS i18n 키 12개 ko/en | ui-builder | `apps/web/i18n/{ko,en}/fcs.json` (신규) | W1.B1.6 | 1 (i18n lint) | ~50 (entries) |

**§B.1 소계**: 8 work units, 36 신규 tests, ~485 LoC, 1.75d (parallel)

### 1.2 Wave 1 work units (§B.2 Pre-Launch Rehearsal — Phase 5 skeleton만)

| ID | 작업 | 담당 agent | 변경/신규 파일 | 의존성 | 신규 테스트 | 예상 LOC |
|---|---|---|---|---|---|---|
| W1.B2.1 | Phase 5 PRD skeleton 작성 | w2a-planner | `docs/PRD/phase5-rehearsal-skeleton.md` (신규) | 없음 | 0 | ~150줄 doc |
| W1.B2.2 | RehearsalResult 타입 placeholder (commented) | backend-dev | `packages/shared-types/src/_phase5-rehearsal.ts` (신규, 빈 export) | 없음 | 0 | ~15 |

**§B.2 소계**: 2 work units, 0 신규 tests, 0.25d (design-only)

### 1.3 Wave 1 work units (§B.3 War Room — 보류 결정 문서화만)

| ID | 작업 | 담당 agent | 변경/신규 파일 | 의존성 | 신규 테스트 | 예상 LOC |
|---|---|---|---|---|---|---|
| W1.B3.1 | War Room defer ADR | w2a-planner | `docs/ADR/2026-05-18-war-room-defer.md` (신규) | 없음 | 0 | ~80줄 |

**§B.3 소계**: 1 work unit, 0 신규 tests, 0.1d

### 1.4 Wave 1 work units (§C.1 ShipVerdict 7-enum)

| ID | 작업 | 담당 agent | 변경/신규 파일 | 의존성 | 신규 테스트 | 예상 LOC |
|---|---|---|---|---|---|---|
| W1.C1.1 | ShipVerdictBanner enhance 7 variants | ui-builder | `apps/web/components/ship-verdict-banner.tsx` (edit) | W1.B1.5 | 7 (per status snapshot) | ~80 (delta) |
| W1.C1.2 | verdict i18n 42 키 ko/en | ui-builder | `apps/web/i18n/{ko,en}/verdict.json` (edit) | W1.C1.1 | 1 (i18n lint) | ~84 (entries) |
| W1.C1.3 | a11y AA contrast audit | inspector | (verification only) | W1.C1.1 | axe report | 0 |

**§C.1 소계**: 3 work units, 8 신규 tests, ~165 LoC, 0.4d

### 1.5 Wave 1 work units (§C.4 TopConcerns 컨테이너)

| ID | 작업 | 담당 agent | 변경/신규 파일 | 의존성 | 신규 테스트 | 예상 LOC |
|---|---|---|---|---|---|---|
| W1.C4.1 | TopConcernsList component | ui-builder | `apps/web/components/top-concerns-list.tsx` (신규) | W1.B1.7 (fcs.topConcerns 소비) | 4 (0/1/2/3 concerns) | ~120 |
| W1.C4.2 | action-hint dict import 검증 | inspector | (verification — appendix D dict at audit-core) | 없음 | 1 (import path) | 0 |

**§C.4 소계**: 2 work units, 5 신규 tests, ~120 LoC, 0.3d

### 1.6 Wave 1 work units (§D.6 DoD 5건 — D4/D5/U7/U8/U9)

| ID | DoD | 검증 작업 | 담당 agent | Verification | 예상 effort |
|---|---|---|---|---|---|
| W1.D.D4 | FCS Δ narrative | snapshot test for score delta render | ui-builder | snapshot fixtures | 0.15d |
| W1.D.D5 | Next 30min persist | (Wave 2 의존 — §C.5 미구현) | — | **DEFER → Wave 2** | — |
| W1.D.D6 | CategoryGrid dim | (Wave 2 의존 — §C.6 미구현) | — | **DEFER → Wave 2** | — |
| W1.D.U7 | Narrative ko/en | (Wave 2 의존 — §C.3 미구현) | — | **DEFER → Wave 2** | — |
| W1.D.U8 | Mobile 360px | per-component baseline 추가 (FCS + ShipVerdict + TopConcerns) | inspector | Playwright visual diff | 0.2d |
| W1.D.U9 | FCS aria-* | axe run + manual aria audit | inspector | axe 0 critical | 0.15d |

**Note**: Wave 1에서 즉시 가능한 DoD = D4 + U8 + U9 (3건). D5/D6/U7은 Wave 2 컴포넌트 의존이므로 deferred 명시.

**§D.6 Wave 1 분량 소계**: 3 work units, 0.5d

### 1.7 Wave 1 종합

| 항목 | 값 |
|---|---|
| Total work units | 8 (B1) + 2 (B2) + 1 (B3) + 3 (C1) + 2 (C4) + 3 (D) = **19** |
| Total 신규 tests | 36 + 0 + 0 + 8 + 5 + 0 = **49** |
| Total LoC | ~485 + 15 + 0 + 165 + 120 + 0 = **~785** (코드) + ~230줄 docs |
| Total effort | 1.75 + 0.25 + 0.1 + 0.4 + 0.3 + 0.5 = **~2.5d** (with parallel) |
| Dependencies | W1.B1.x → W1.C1.x / W1.C4.x; doc tasks 독립 |

---

## 2. Wave 2 — P1 7건 (4d + Insight Reorg 5d 병합 = 9d 통합 계획)

### 2.0 범위 명시

Wave 2는 **Sharpen PRD §D.2 (Insight Reorg 5d) + §D.3 일부 P1 5건 + §A.2 P1 2건 (L-P1-2 demoted, L-P1-3 promoted)** 를 통합한다. 본 Sprint 4 plan에서는 L-P1-1~7 work unit으로 분해하고, 각 P1과 Insight §C.x 의존성을 명시한다.

### 2.1 L-P1-1 ProfileBadge i18n (en 보강)

| 필드 | 값 |
|---|---|
| 담당 agent | ui-builder |
| 변경 파일 | `apps/web/components/profile-badge.tsx`, `apps/web/i18n/en/profile.json` |
| 의존성 | 없음 (즉시 실행 가능) |
| 신규 테스트 | 1 (snapshot ko/en × 4 profile) |
| 예상 LOC | ~30 (edit) |
| Effort | 0.25d |
| DoD | en 키 4개 추가 (landing/saas/ecommerce/vibe-coded), snapshot PASS |
| **§C 매핑** | 없음 (독립 P1) |
| **중복 분석** | 중복 없음 |

### 2.2 L-P1-2 feature-graph adapter test (P2 demoted but 묶음)

| 필드 | 값 |
|---|---|
| 담당 agent | backend-dev |
| 변경 파일 | `packages/audit-core/src/feature-graph/adapter.test.ts` (신규) |
| 의존성 | 없음 |
| 신규 테스트 | 4+ (DEPENDS_ON / IMPORTS / circular / empty) |
| 예상 LOC | ~120 (test only) |
| Effort | 0.5d |
| DoD | 4 edge type 케이스 + circular detection PASS |
| **§C 매핑** | 없음 |
| **중복 분석** | 중복 없음 |

### 2.3 L-P1-3 Narrative 3-sentence template (P0 promoted, §C.3 통합)

| 필드 | 값 |
|---|---|
| 담당 agent | backend-dev (template engine) + ui-builder (component) |
| 변경 파일 | `packages/audit-core/src/narrative/render-narrative.ts` (신규), `apps/web/components/narrative.tsx` (신규) |
| 의존성 | W1.B1.2 (computeFCS — topConcerns 소비) |
| 신규 테스트 | 14 (7 status × 2 lang, 핵심 라우트만) |
| 예상 LOC | ~80 (engine) + ~70 (component) = 150 |
| Effort | 1.5d |
| DoD | 3-sentence template, ko/en 자연어 통과 (U7 만족), max 180자 (ko) / 300자 (en) |
| **§C 매핑** | §C.3 Narrative 직접 구현 |
| **중복 분석** | 없음 — §C.3 spec과 1:1 |

### 2.4 L-P1-4 EvidencePanel collapse persist

| 필드 | 값 |
|---|---|
| 담당 agent | ui-builder |
| 변경 파일 | `apps/web/components/evidence-panel.tsx` (edit), `apps/web/hooks/use-persistent-collapse.ts` (신규) |
| 의존성 | 없음 |
| 신규 테스트 | 4 (collapse/expand/persist/SSR hydration) |
| 예상 LOC | ~80 (edit + 신규 hook) |
| Effort | 0.5d |
| DoD | localStorage key=`cts.evidence.collapsed.{ruleId}`, e2e refresh test |
| **§C 매핑** | §C.9 EvidencePanel enhance |
| **중복 분석** | 없음 |

### 2.5 L-P1-5 ko/en toggle 즉시 반영

| 필드 | 값 |
|---|---|
| 담당 agent | ui-builder + backend-fixer (revalidatePath) |
| 변경 파일 | `apps/web/components/lang-toggle.tsx` (edit), `apps/web/app/actions/revalidate-lang.ts` (신규) |
| 의존성 | 없음 |
| 신규 테스트 | 3 (visual regression ko/en, hydration mismatch 0) |
| 예상 LOC | ~50 |
| Effort | 0.5d |
| DoD | revalidatePath 호출, suppressHydrationWarning 명시, visual diff PASS |
| **§C 매핑** | 없음 (인프라성) |
| **중복 분석** | 없음 |

### 2.6 L-P1-6 Skeleton loading state

| 필드 | 값 |
|---|---|
| 담당 agent | ui-builder |
| 변경 파일 | `apps/web/components/skeletons/{ship-verdict-skeleton,score-skeleton,narrative-skeleton}.tsx` (3 신규) |
| 의존성 | W1.C1.1 (ShipVerdict 컨테이너), L-P1-3 (Narrative), W1.B1.7 (FCS) |
| 신규 테스트 | 3 (suspense boundary per component) |
| 예상 LOC | ~100 (3 skeleton) |
| Effort | 0.5d |
| DoD | Suspense boundary 동작, TTI gain ≥ 100ms (Lighthouse) |
| **§C 매핑** | **§C.4 (TopConcerns 컨테이너)와 별도 sub-task로 유지** |
| **중복 분석 (요청 명시)** | **§C.4는 TopConcernsList의 데이터 렌더 컨테이너이고, L-P1-6은 loading 단계의 placeholder 컴포넌트. 둘은 책임이 다르며 (rendering vs loading state) 별도 컴포넌트로 분리 유지. 통합하지 않고 분리.** |

### 2.7 L-P1-7 Mobile 360px 회귀 가드

| 필드 | 값 |
|---|---|
| 담당 agent | inspector + ui-builder |
| 변경 파일 | `apps/web/__tests__/visual/mobile-360.spec.ts` (신규), `playwright.config.ts` (edit add viewport project) |
| 의존성 | Wave 1 + Wave 2의 모든 컴포넌트 (10 블록 완성 후) |
| 신규 테스트 | 10 (per block visual baseline) |
| 예상 LOC | ~150 (test) |
| Effort | 0.5d |
| DoD | 10 block × 360x640 baseline 저장, CI gate 통과 |
| **§C 매핑** | §C 전체 (모든 블록 검증) |
| **중복 분석** | 없음 — 검증성 |

### 2.8 Wave 2 신규 §C 컴포넌트 (P1과 별도, Insight Reorg 본체)

| ID | 작업 | 담당 agent | 파일 | 의존성 | 신규 테스트 | LOC | Effort |
|---|---|---|---|---|---|---|---|
| W2.C2.1 | (W1.B1.7 와 같음 — 중복 제외) | — | — | — | — | — | — |
| W2.C5.1 | Next30MinChecklist | ui-builder | `apps/web/components/next-30min-checklist.tsx` | W1.C4.1 | 5 (filter ETA≤30, 0~3 items, persist) | ~110 | 1d |
| W2.C5.2 | use-persistent-checklist hook | ui-builder | `apps/web/hooks/use-persistent-checklist.ts` | 없음 | 3 | ~50 | (W2.C5.1 포함) |
| W2.C6.1 | CategoryGrid 2×6 | ui-builder | `apps/web/components/category-grid.tsx` | tie-break (W4 A.4.4 의존) | 4 (12 cells render, weight=0 dim, tooltip, click filter) | ~130 | 0.75d |
| W2.C7.1 | FindingsList filter+sort enhance | ui-builder | `apps/web/components/findings-list.tsx` (edit) | 없음 | 4 (4 filter dimensions, sort) | ~70 (delta) | 0.5d |
| W2.C8.1 | CoverageMatrix UI 완성 (W2-B) | ui-builder + backend-fixer | `apps/web/components/coverage-matrix.tsx` (신규) + audit-core primaryPath fallback usage | A.4.3 primaryPath fix (Wave 3) | 5 (sticky, scroll hint, claim status badge) | ~140 | 1d |
| W2.C10.1 | RunMetadataStrip | ui-builder | `apps/web/components/run-metadata-strip.tsx` (신규) | 없음 | 2 (timestamp format, version pill) | ~50 | 0.5d |
| W2.C-i18n | i18n ~994 entries (≈ 497 키 × 2 lang) | content-marketer 위임 (skill 호출) | `apps/web/i18n/{ko,en}/*.json` (확장) | W2.C5/6/8/10 키 정의 후 | 1 (i18n missing key lint) | ~994 entries | 1d (parallel) |

**Wave 2 §C 소계**: 7 work units, 24 신규 tests, ~550 LoC + 994 i18n entries, 4.75d (parallel)

### 2.9 Wave 2 종합

| 항목 | 값 |
|---|---|
| P1 work units | 7 (L-P1-1~7) |
| §C work units | 7 (C5/C6/C7/C8/C10/i18n + skeleton 분리) |
| Total work units | **14** |
| Total 신규 tests | 1+4+14+4+3+3+10 (P1) + 5+3+4+4+5+2+1 (§C) = **63** |
| Total LoC | ~750 (P1) + ~550 (§C) = **~1,300** + 994 i18n |
| Total effort | 4d (P1) + 4.75d (§C parallel) ≈ **9d** (직렬 의존성 고려 시 7d 압축 가능) |

---

## 3. Wave 3 — Documentation + Hardening (3.5d)

### 3.0 범위 명시

Wave 3은 **ROADMAP 갱신 + 마이그레이션 5-step 문서화 + L-P0-2 infra (Cloud Run + monitoring) + Phase 4.5 cleanup 4건 (Sharpen §A.4) + Wave 5 pre-launch QA 일부 (DATA POLICY audit, legal copy)** 를 묶음 처리한다.

### 3.1 ROADMAP 갱신

| ID | 작업 | 담당 agent | 파일 | 의존성 | 신규 테스트 | LOC | Effort |
|---|---|---|---|---|---|---|---|
| W3.DOC.1 | ROADMAP Phase 4 (현재) → Phase 5 (launch) 갱신 | w2a-planner | `cleartoship/docs/ROADMAP.md` (edit) | Wave 2 완료 | 0 | ~60줄 doc | 0.25d |
| W3.DOC.2 | Sprint 1/2/3 완료 표 + Sprint 4 진행률 | w2a-planner | `cleartoship/docs/ROADMAP.md` (edit) | W3.DOC.1 | 0 | ~30줄 doc | 0.15d |

### 3.2 Schema Migration 5-step 문서화

| ID | 작업 | 담당 agent | 파일 | 의존성 | 신규 테스트 | LOC | Effort |
|---|---|---|---|---|---|---|---|
| W3.MIG.1 | Migration 5-step doc (FCS 필드 추가 시) | w2a-planner | `cleartoship/docs/MIGRATIONS/2026-05-19-add-fcs-field.md` (신규) | W1.B1.3 (calculate-scores 통합) | 0 | ~120줄 | 0.3d |

**5-step 정의** (doc 내부):
1. **Schema add** — `domain.ts`에 `fcs?: FCSResult` optional 필드 (nullable) 추가, base 패키지부터
2. **Cross-package sync** — shared-types + audit-core + audit-worker 3종 zod 동기화 (memory rule: feedback_full_test_run.md 준수)
3. **Backfill** — 기존 Firestore docs는 `fcs=null`로 유지, 새 run만 계산
4. **UI fallback** — `fcs == null`이면 ScoreGauge fallback render
5. **Cleanup gate** — 30일 후 (2026-06-18) `fcs` required 전환, ADR 작성 후 진행

### 3.3 L-P0-2 Infra (Cloud Run + monitoring)

| ID | 작업 | 담당 agent | 파일 | 의존성 | 신규 테스트 | LOC | Effort |
|---|---|---|---|---|---|---|---|
| W3.INF.1 | Cloud Run min-instance=1 설정 | devops | `infra/terraform/cloud-run.tf` (edit) | 없음 | 0 (manual smoke) | ~10 (delta) | 0.25d |
| W3.INF.2 | Cloud Tasks queue capacity tune | devops | `infra/terraform/cloud-tasks.tf` (edit) | 없음 | 0 | ~15 | 0.25d |
| W3.INF.3 | Firestore composite index (runs.profile + status) | devops | `firestore.indexes.json` (edit) | 없음 | index deploy verify | ~20 | 0.25d |
| W3.INF.4 | Monitoring dashboard (Cloud Run latency, Tasks backlog, error rate) | devops | `infra/monitoring/dashboard.json` (신규) | W3.INF.1~3 | 1 (dashboard render) | ~80 | 0.5d |
| W3.INF.5 | Alert policy (p99 latency > 5s, error rate > 1%) | devops | `infra/monitoring/alerts.tf` (신규) | W3.INF.4 | 0 | ~50 | 0.25d |

### 3.4 Phase 4.5 Cleanup 4건 (Sharpen §A.4)

| ID | 작업 | 담당 agent | 파일 | 의존성 | 신규 테스트 | LOC | Effort |
|---|---|---|---|---|---|---|---|
| W3.CLN.1 | A.4.1 ghostButtonHeuristicForced fix | backend-fixer | `packages/audit-core/src/profiles/index.ts` (edit) + tests | 없음 | 4 (per profile freeze check) | ~40 | 0.5d |
| W3.CLN.2 | A.4.2 truncate utility | backend-dev | `packages/audit-core/src/utils/truncate.ts` (신규) + tests | 없음 | 4 (UTF-8 boundary, emoji, null, 0-len) | ~50 + 60 test | 0.25d |
| W3.CLN.3 | A.4.3 primaryPath fallback | backend-fixer | `packages/audit-core/src/coverage-matrix.ts` (edit) + i18n key | W3.CLN.2 (truncate 사용 가능) | 3 (null / valid / multi-evidence) | ~30 (delta) | 0.25d |
| W3.CLN.4 | A.4.4 BUSINESS_READINESS tie-break | backend-fixer | `packages/audit-core/src/calculate-scores.ts` (edit) | W1.B1.3 (calculate-scores 변경과 충돌 가능 → 직렬 처리) | 1 (12-category snapshot) | ~25 (delta) | 0.5d |

### 3.5 Pre-launch QA 일부 (Wave 5 분량 일부 위임)

| ID | 작업 | 담당 agent | 파일 | 의존성 | 신규 테스트 | LOC | Effort |
|---|---|---|---|---|---|---|---|
| W3.QA.1 | DATA POLICY 최종 audit (no external code transmission) | inspector | `docs/audits/2026-06-03-data-policy-audit.md` (신규) | Wave 2 완료 | report | ~100줄 | 0.5d |
| W3.QA.2 | Legal copy review ("유일한" 표현 가드) | content-marketer 위임 + w2a-planner | `apps/web/i18n/{ko,en}/marketing.json` (edit) | 없음 | 1 (forbidden word lint) | ~30 (delta) | 0.25d |

### 3.6 Wave 3 종합

| 항목 | 값 |
|---|---|
| Total work units | 2 (ROADMAP) + 1 (Migration) + 5 (Infra) + 4 (Cleanup) + 2 (QA) = **14** |
| Total 신규 tests | 0+0+1+12+1 = **14** |
| Total LoC | ~180줄 doc + 200줄 infra + 145줄 code + 60줄 test = **~585** |
| Total effort | 0.4d + 0.3d + 1.5d + 1.5d + 0.75d = **~3.5d** (devops 트랙 + inspector 트랙 병렬) |

---

## 4. 병렬화 Slot 다이어그램 — 4 트랙 × 6 멤버 매핑

### 4.1 6 멤버 역할 정의

| 멤버 | 역할 | 주 트랙 | 보조 트랙 |
|---|---|---|---|
| **backend-fixer** | 기존 코드 bug fix, edit 위주 | Track A | Track C (cleanup) |
| **backend-dev** | 신규 모듈 작성, algorithm 구현 | Track A | — |
| **ui-builder** | UI 컴포넌트, i18n 키 정의, hook | Track B | Track D (i18n) |
| **devops** | Cloud Run / Tasks / Firestore 인프라, monitoring | Track C | — |
| **inspector** | 검증, a11y, visual baseline, security audit | Track C | Track D (audit) |
| **w2a-planner** | 문서, ADR, ROADMAP, migration doc | Track D | — |

### 4.2 4 트랙 정의

| Track | 이름 | 멤버 | 주 활동 |
|---|---|---|---|
| **A** | Backend Core | backend-dev (primary), backend-fixer (support) | FCS algorithm, schema, narrative engine, cleanup |
| **B** | UI Surface | ui-builder (primary) | 10-block stack 컴포넌트, hooks, i18n 정의 |
| **C** | QA + Infra | inspector + devops | visual baseline, a11y, Cloud Run, monitoring, audit |
| **D** | Content + Docs | w2a-planner + content-marketer (외부 위임) | ROADMAP, ADR, migration doc, copy, i18n 번역 |

### 4.3 슬롯 다이어그램 (시간 축 가로, 트랙 세로)

```
Day:        D1  D2  D3  D4  D5  D6  D7  D8  D9  D10 D11 D12 D13 D14 D15 D16
            ====Wave1====|=========Wave2==========|====Wave3====|==Pre-launch==
            05-19~05-20  | 05-21 ~ 05-27          | 05-28~06-02 | 06-03~06-05

Track A     [B1.1-6]    [L-P1-3 engine]          [CLN.1-4]     [-]
backend     [B1.3 int]   [L-P1-2 test]            [B1 polish]
            └─ FCS core  └─ Narrative + tests     └─ 4 cleanup

Track B     [C1.1-2]    [C5/C6/C7/C8/C10]        [polish]      [hot-fix]
ui-builder  [C4.1]       [L-P1-1/4/5/6]           [L-P1-7]
            [B1.7-8]     [W2-A UI (Wave3 sharp)]
            └─ ShipVerdict + FCS UI + i18n keys   └─ 10 blocks ready

Track C     [C1.3]      [-]                       [INF.1-5]     [QA.1]
inspector   [U8/U9]      [L-P1-7 baseline]        [audits]      [smoke]
+devops     └─ a11y + 360px                       └─ Cloud Run ready

Track D     [B2.1, B3.1] [i18n 994 entries]      [DOC.1-2]     [QA.2]
planner     └─ Phase5/   [Migration MIG.1]        [marketing]
+content      ADR docs                            └─ ROADMAP    └─ legal
```

### 4.4 트랙 간 동기화 지점 (sync gate)

| Gate | 시점 | 조건 | 차단 시 영향 |
|---|---|---|---|
| **G1** | D3 (Wave 1 종료) | FCS API 안정화, ShipVerdict 7-enum 머지 | Wave 2 Narrative 의존 차단 |
| **G2** | D8 (Wave 2 중간) | i18n 키 정의 완료 → 번역 시작 가능 | content-marketer 위임 차단 |
| **G3** | D10 (Wave 2 종료) | 10 블록 모두 머지 → 360px baseline 가능 | L-P1-7 차단 |
| **G4** | D13 (Wave 3 중간) | Cleanup 4건 + Infra 머지 → DATA POLICY audit 시작 | Pre-launch 차단 |
| **G5** | D16 (Pre-launch 종료) | 모든 DoD PASS, manual smoke ✓ | Launch 차단 |

### 4.5 동시 실행 가능 작업 매트릭스 (D1~D5 zoom)

| Day | Track A | Track B | Track C | Track D |
|---|---|---|---|---|
| D1 AM | W1.B1.1 (FCS type) | W1.C1.1 (ShipVerdict variants) | (대기) | W1.B2.1 skeleton doc |
| D1 PM | W1.B1.2 (computeFCS) | W1.C1.2 (verdict i18n) | (대기) | W1.B3.1 ADR |
| D2 AM | W1.B1.4 weights + W1.B1.5 deriveStatus | W1.B1.7 FCS UI | W1.C1.3 a11y audit | (대기) |
| D2 PM | W1.B1.6 rationale + W1.B1.3 integration | W1.B1.8 fcs i18n + W1.C4.1 TopConcerns | W1.D.U9 axe audit | (대기) |
| D3 AM | (CLN.4 미리 시작 가능 if no conflict) | W1.D.D4 snapshot | W1.D.U8 mobile baseline | (W2 prep) |

---

## 5. Risk Gate 5건

### 5.1 R-GATE-1: TDZ (Temporal Dead Zone) 위험 — zod schema 변경 시

| 필드 | 값 |
|---|---|
| 트리거 | W1.B1.1 (FCSResult schema 추가), W3.MIG.1 (migration), W3.CLN.4 (calculate-scores 변경) |
| Risk | base 패키지 schema enum 순서 변경 시 isolated test는 통과하나 cross-package에서 TDZ 발생 |
| Mitigation | **memory rule feedback_full_test_run.md 강제 준수**: `pnpm test`를 shared-types + audit-core + audit-worker 3종 모두 실행 |
| Gate | 모든 schema 변경 PR은 CI `full-test-run` job PASS 후에만 머지 가능 |
| Owner | backend-fixer (PR template에 checklist 추가) |

### 5.2 R-GATE-2: Mobile QA — 360px 가드

| 필드 | 값 |
|---|---|
| 트리거 | Wave 2 신규 컴포넌트 (§C.5/6/8/10) |
| Risk | 데스크탑에서만 검증된 컴포넌트가 360px에서 깨짐 (특히 CategoryGrid 2×6) |
| Mitigation | L-P1-7 (Wave 2 마지막) Playwright visual baseline 의무화, CI gate로 진행 |
| Gate | 10 블록 모두 360x640 visual diff PASS 후에만 Wave 3 진입 |
| Owner | inspector |

### 5.3 R-GATE-3: 법무 카피 — "유일한" 표현 reject

| 필드 | 값 |
|---|---|
| 트리거 | W3.QA.2 (legal copy review) |
| Risk | hero copy "유일한" / "최고의" 등 절대 표현 → 광고법 위반 가능 |
| Mitigation | Appendix B 금지 단어 list lint script (CI), 대체 표현 사전 준비 ("결정론적인", "No-LLM 기반") |
| Gate | i18n lint에서 forbidden word 0건 PASS 후에만 production deploy |
| Owner | content-marketer 위임 + w2a-planner 검수 |

### 5.4 R-GATE-4: Schema migration — FCS optional → required 전환

| 필드 | 값 |
|---|---|
| 트리거 | W3.MIG.1 step 5 (30일 후 required 전환) |
| Risk | 기존 Firestore docs `fcs=null` 상태에서 required 전환 시 read 실패 |
| Mitigation | step 4 (UI fallback) 검증 + step 5 진입 전 backfill script로 모든 docs에 fcs 계산 채워 넣기 |
| Gate | backfill 100% 완료 + 7일 모니터링 무사 후에만 step 5 진입 |
| Owner | backend-dev + devops |

### 5.5 R-GATE-5: Cross-check 필수 — 모든 Wave 종료 시점

| 필드 | 값 |
|---|---|
| 트리거 | Wave 1/2/3 각 종료, Pre-launch 직전 |
| Risk | 단일 agent 산출물 self-review로 인한 blind spot |
| Mitigation | **memory rule feedback_review_model.md 준수**: code-review/inspector를 **Opus 4.7로 강제** (Sonnet 기본값 override). adversarial-review skill 필요 시 사용 |
| Gate | 각 Wave 종료 시 cross-check report (inspector 작성) PASS 후에만 다음 Wave 진입 |
| Owner | inspector (Opus 4.7 강제) |

---

## 6. 즉시 실행 가능한 Next Task 5건 (Phase 2 Dispatch 직전 우선순위)

### T36.NEXT-1: FCSResult type + zod schema (W1.B1.1)
- **담당**: backend-dev
- **파일**: `packages/shared-types/src/fcs.ts` (신규)
- **의존성**: 없음 — 즉시 시작 가능
- **DoD**: zod schema valid/invalid 4 tests PASS, full test run 3종 PASS (TDZ 가드)
- **예상 시간**: 2시간
- **우선순위**: P0 — Wave 1 전체의 dependency root

### T36.NEXT-2: ShipVerdict 7-variants 컴포넌트 (W1.C1.1)
- **담당**: ui-builder
- **파일**: `apps/web/components/ship-verdict-banner.tsx` (edit)
- **의존성**: 없음 (병렬 시작 가능, 단 W1.C1.2 i18n은 deriveStatus 정의 후)
- **DoD**: 7 status × snapshot test PASS, 360px 1차 render OK
- **예상 시간**: 3시간
- **우선순위**: P0 — Track B 첫 작업

### T36.NEXT-3: Phase 5 Rehearsal skeleton + War Room defer ADR (W1.B2.1, W1.B3.1)
- **담당**: w2a-planner
- **파일**: `docs/PRD/phase5-rehearsal-skeleton.md`, `docs/ADR/2026-05-18-war-room-defer.md`
- **의존성**: 없음 — 즉시 실행 가능 (design only)
- **DoD**: 150줄 + 80줄 doc, sharpen PRD §B.2/B.3 결정 근거 명시
- **예상 시간**: 2시간
- **우선순위**: P1 — Track D 첫 작업 (병렬 가능)

### T36.NEXT-4: Wave 2 §C.x 컴포넌트 인터페이스 정의 (선 wireframe)
- **담당**: ui-builder + w2a-planner
- **파일**: `apps/web/components/_specs/wave2-interfaces.md` (신규)
- **의존성**: 없음 (Wave 2 시작 전 prep)
- **DoD**: 5 컴포넌트 (C5/C6/C7/C8/C10) props interface + i18n key list 정의
- **예상 시간**: 4시간
- **우선순위**: P1 — Wave 2 진입 시 ramp-up 시간 단축

### T36.NEXT-5: Risk gate CI 인프라 (full-test-run job + forbidden-word lint)
- **담당**: devops + inspector
- **파일**: `.github/workflows/full-test-run.yml`, `scripts/lint-forbidden-words.mjs`
- **의존성**: 없음 (sprint 4 진입 직전 인프라)
- **DoD**: PR template에 checklist 추가, CI에서 자동 차단 동작 확인
- **예상 시간**: 5시간
- **우선순위**: P0 — Risk Gate 1 + 3 자동화의 prerequisite

---

## 7. Sprint 4 종합 매트릭스

### 7.1 Wave별 총량

| Wave | Work Units | Tests | LoC | Effort | Track |
|---|---|---|---|---|---|
| Wave 1 | 19 | 49 | ~785 | 2.5d | A+B+C+D |
| Wave 2 | 14 | 63 | ~1,300 | 7~9d | A+B+D |
| Wave 3 | 14 | 14 | ~585 | 3.5d | A+C+D |
| **Total** | **47** | **126** | **~2,670** + 994 i18n entries | **~13~15d** (병렬화 후) | 4 트랙 |

Sharpen PRD §D 16.5d에서 Pre-launch (3d, Wave 5) 분리 시 13.5d ≈ 본 plan 13~15d 범위와 일치.

### 7.2 Track별 effort 분배

| Track | Wave 1 | Wave 2 | Wave 3 | 총 (병렬화 후) |
|---|---|---|---|---|
| A (backend) | 1.5d | 1.5d (Narrative) + 0.5d (L-P1-2) | 1.5d (cleanup) | ~5d |
| B (ui) | 1d | 4.75d (§C + P1) | 0d (polish) | ~6d |
| C (qa + infra) | 0.5d | 0.5d (L-P1-7) | 1.5d (infra + audit) | ~2.5d |
| D (planner + content) | 0.5d | 1d (i18n + interfaces) | 0.75d (doc + legal) | ~2.5d |

### 7.3 핵심 마일스톤

| 날짜 | 마일스톤 | 검증 |
|---|---|---|
| 2026-05-19 | Sprint 4 kickoff, T36.NEXT-1~5 dispatch | 5 task in_progress |
| 2026-05-20 (G1) | Wave 1 종료 — FCS + ShipVerdict ready | FCS UI snapshot, ShipVerdict 7 variants |
| 2026-05-25 (G2) | Wave 2 중간 — i18n 키 정의 완료 | content-marketer 위임 시작 |
| 2026-05-27 (G3) | Wave 2 종료 — 10 블록 완성 | 360px baseline PASS |
| 2026-06-02 (G4) | Wave 3 종료 — cleanup + infra ready | DATA POLICY audit PASS |
| 2026-06-05 (G5) | Pre-launch 완료, go-live | manual smoke ✓, Cloud Run health ✓ |

---

## 8. Phase 2 Dispatch 핸드오프

### 8.1 Phase 2 진입 조건

- [x] Sprint 4 plan 작성 완료 (본 문서)
- [ ] team-lead 승인
- [ ] T36.NEXT-1~5 task 생성 (Phase 2 작업)
- [ ] 6 멤버에게 Track 할당 broadcast

### 8.2 핵심 결정 7건 (PLAN 산출물)

| # | 결정 | 근거 |
|---|---|---|
| P1 | Wave 1 = FCS 즉시 구현 + B2/B3 defer skeleton만 | Sharpen §B.4 9.05/10 1순위, 5일 launch 충족 |
| P2 | 10-block Insight stack을 Wave 2 통합 work unit으로 | §C 전체 + P1 5건 동시 머지로 trip 최소화 |
| P3 | L-P1-6 Skeleton과 §C.4 TopConcerns는 별도 sub-task 유지 | 책임 분리 (rendering vs loading) |
| P4 | 4 트랙 모델 채택 (A/B/C/D) | 6 멤버 모두 동시 가용, sync gate 5개로 조정 |
| P5 | Risk Gate 5건 자동화 (CI infrastructure) | TDZ + forbidden word는 사람이 매번 체크할 수 없음 |
| P6 | content-marketer i18n 위임은 G2 (D8) 시점부터 | 키 정의 완료 후가 아니면 번역 폐기 위험 |
| P7 | Wave 5 (Pre-launch)는 별도 Sprint 5로 분리 검토 권고 | 3d만 별도 sprint로 분리 시 launch focus 강화 가능 (team-lead 결정 사항) |

### 8.3 미확정 / team-lead 결정 필요

| ID | 항목 | 옵션 |
|---|---|---|
| Q1 | Sprint 4 → Sprint 4 + 5 분리 여부 | A) 단일 sprint 16.5d / B) Sprint 4 (13d) + Sprint 5 (3d pre-launch) |
| Q2 | content-marketer 외부 위임 가능 여부 | 6 멤버 외 추가 위임 시 Token budget 검토 필요 |
| Q3 | code-reviewer를 Opus 4.7 강제 → cost 증가 | memory rule feedback_review_model.md 준수 시 OK |
| Q4 | Phase 5 Rehearsal PRD skeleton 깊이 | A) 150줄 minimal / B) 400줄 full design |

---

## 9. References

- [Sharpen PRD](./finalize-launch-sharpen-2026-05-18.md): §B/§C/§D
- [Base PRD](./finalize-launch-2026-05-18.md): §1~§6
- [W2-A PRD](./w2a-prd-upload.md): AC1~AC9
- Appendix A~D: wireframes / copywriting / coverage-matrix / action-hint
- ROADMAP: `cleartoship/docs/ROADMAP.md`
- Memory rules: feedback_full_test_run.md, feedback_review_model.md, feedback_six_layer_drill.md, feedback_audit_core_ssot.md
- Project memory: project_severity_enum.md, project_audit_pipeline.md, project_audit_categories.md, project_audit_profiles.md, project_session_2026_05_17.md

---

**END OF PLAN — 본 문서는 design-only이며 코드 변경을 포함하지 않습니다. Phase 2 Dispatch 단계에서 T36.NEXT-1~5 5 task를 우선 생성하여 Sprint 4 kickoff.**
