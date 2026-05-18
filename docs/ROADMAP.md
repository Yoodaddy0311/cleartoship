# ClearToShip Master Roadmap

**Generated**: 2026-05-17 (autonomous /team synthesis)
**Sources**: LLM/01~06 설계안 (codex+Claude 협업) + Audit_Report (self-audit 64점 NEEDS_WORK) + Blueprint UPG-01~12 + Round 1~4 self-audit results
**Status legend**: ✅ DONE | 🔄 IN PROGRESS | ⏳ PENDING | 🔒 BLOCKED | 🚫 IGNORED

---

## 진행 요약

| Phase | 항목 수 | DONE | IN PROGRESS | PENDING | Effort 잔여 |
|-------|--------|------|-------------|---------|------------|
| **이미 완료** (Round 1~4) | 13 | 13 | 0 | 0 | — |
| Phase 0 (즉시) | 5 | 5 | 0 | 0 | — |
| Phase 1 (MVP) | 8 | 7 | 2 | 0 | ~3d |
| Phase 2 (UX+확장) | 15 | 13 | 0 | 2 | ~5d |
| Phase 3 (LLM BYOK) | 9 | 0 | 0 | 9 | ~25d |
| Backlog FUTURE | 19 | 0 | 0 | 19 | — |
| IGNORED | 8 | 8 | 0 | 0 | — |

> 진행 요약 마지막 갱신: 2026-05-17 (Sprint 2 완료). Phase 0 = T0.1~T0.5 ✅. Phase 1 = T1.1a/b/c/d ✅, T1.2/T1.2-FU/T1.3/T1.3-FU/T1.5/T1.7 ✅; T1.4/T1.6 🔄. Phase 2 = T2.1/T2.2/T2.3/T2.4/T2.5/T2.6/T2.7/T2.8/T2.9/T2.11/T2.12/T2.13 ✅; T2.10/T2.14/T2.15 ⏳. Deferred: #45 d1-prd-schema (exactOptionalPropertyTypes + PipelineState 타입), #96 T1.6-FU Cloud Run min-instances.

---

## ✅ 이미 완료 (Round 1~4 self-audit)

| ID | 항목 | 상태 | Commit |
|----|------|------|--------|
| R1-BUG-1 | calculate-scores measuredBy partial-run N/A | ✅ | 7809ba6 |
| R1-BUG-2 | composeOneLineSummary INDETERMINATE 분기 | ✅ | 7809ba6 |
| R1-BUG-3 | risky-functions Firestore false-positive guard | ✅ | 7809ba6 |
| R2-BUG-3 | risky-functions extractImports CommonJS + PRISMA guard | ✅ | 7809ba6 |
| R3-#54 | render-markdown §1 INDETERMINATE 분기 | ✅ | 7809ba6 |
| R4-O1 | risky-functions src/+lib/ path-component anchor + 빌드 산출물 제외 | ✅ | 7809ba6 |
| R4-O2 | 07-dependency-scan dedupOsvFindings (pkg\|GHSA\|version) | ✅ | 7809ba6 |
| R4-O3 | risky-functions nameAbsoluteIndex dedup | ✅ | 7809ba6 |
| R4-O4 | risky-functions IMPORT_SCAN_MAX_LINES=200 + 5줄 종료 | ✅ | 7809ba6 |
| R4-SELF | Self-audit round 4 (runId aKmQ7FXFIoHckb6Xwoa3): src/+lib dups 0, function dups 0, import miss 0 | ✅ | 라운드4 |
| R3-PERF-N1 | feature-graph N+1 제거 | ✅ | 5b76c30 |
| R3-PERF-F4 | polling pause via Page Visibility API | ✅ | 5b76c30 |
| R3-SCORE-1B-a | confidence-weighted scoring | ✅ | 5b76c30 |

---

## Phase 0 (즉시, ~3일) — 신뢰도 회복 베이스라인

| ID | 항목 | 출처 | P | Effort | 상태 | 담당 |
|----|------|------|---|--------|------|------|
| T0.1 | README "Sprint 0 Mock Worker" → 현재 상태 라벨 정정 | A1-W1-Z / A4-P0-03 | P0 | XS (30m) | ✅ | ts-pro-bug1 |
| T0.2 | `pnpm dev:full` + `pnpm doctor` 통합 스크립트 | A4-UPG-02 | P0 | S (2-3h) | ✅ | mvp-planner |
| T0.3 | audit-steps.ts 주석 "15→18 step" 정합 | A4-P2-01 | P1 | XS (30m) | ✅ | ts-pro-bug1 |
| T0.4 | Build/Test/Lint Green Gate CI 강화 | A4-UPG-01 | P0 | S (1d) | ✅ | reviewer-s5 — Gate fully active after T0.4-FU (eslint config 3pkg, audit-core rebuild, w1a-checklist DOCS→MAINTAINABILITY_DOCUMENTATION) |
| T0.5 | 환경 도구 5개 정상화 (osv/semgrep/lighthouse-axe/prisma/design-consistency) | R4 finding | P0 | M (1d) | ✅ | mvp-planner |

---

## Phase 1 (MVP 측정 표면 정상화, ~2주)

| ID | 항목 | 출처 | P | Effort | 상태 | 담당 |
|----|------|------|---|--------|------|------|
| **T1.1** | **04-F 비용 가드레일** (rate limit + repo size cap + DAILY_GLOBAL_LIMIT) — split into T1.1a/b/c | A2-04-F | **P0** | L (3d) | ✅ (3/3) | be-bug2 |
| T1.1a | per-IP rate limit (audit-runs create boundary) | A2-04-F | P0 | S (2-3h) | ✅ | be-bug2 |
| T1.1b | **repo size cap** (REPO_MAX_FILES=5000 / REPO_MAX_BYTES=500MB → `launchStatus=BLOCKED`+`abortReason=REPO_TOO_LARGE`) — 03-clone-repo.ts + runner.ts short-circuit + markRunBlocked writer + UI BLOCKED token | A2-04-F | P0 | S (2-3h) | ✅ | be-bug2 |
| T1.1c | **global daily quota** (`DAILY_AUDIT_LIMIT`, default 1000/day, UTC bucket) — `apps/web/lib/audit-runs/daily-quota.ts` Firestore `system/quota/daily/{YYYY-MM-DD}` runTransaction atomic counter + `DailyQuotaExceededError` → POST /api/audit-runs **429 Too Many Requests + `Retry-After`** header (sec until UTC midnight) with `details.reason=DAILY_QUOTA_EXCEEDED` + `retryAfterSeconds` (8 quota unit tests + create-audit-run/route quota-denied integration tests, 429 + Retry-After 검증) | A2-04-F | P0 | S (2-3h) | ✅ | be-bug2 |
| T1.1d | **AuditRunSchema launchStatus/abortReason 노출** (T1.1b 후속 wrap-up — `markRunBlocked`가 Firestore에 stamping하던 BLOCKED 메타데이터가 zod schema 누락으로 fromFirestore에서 strip되던 문제 해결: `packages/shared-types/src/domain.ts` AuditRunSchema에 `launchStatus?` + `abortReason?` optional 필드 추가, LaunchStatus enum 정의를 schema 위로 이동, 7개 신규 unit test로 round-trip 검증, web adapter `BLOCKED → 'blocked'` 매핑은 기존대로 동작) | A2-04-F follow-up | P1 | S (1-2h) | ✅ | mvp-planner |
| T1.2 | 01 W1-A measuredBy 5개 즉시 연결 — INDETERMINATE 직격타 | A1-W1-A / A4-UPG-03 | P0 | S (1.5d) | ✅ | w1-enum-activator — PoC for W1-A1 only (checklist.ts + audit-evidence.ts + step04 README detect + state.evidence). W1-A2~A5 covered by T1.2-FU |
| T1.2-FU | W1-A pipeline integration (W1AEvidence 5 keys + step04 detectors + step11 buildW1AFindings + render-markdown §1 W1-A 테이블) | A1-W1-A | P0 | S (1d) | ✅ | w1-enum-activator — w1aEvidence state field + detectPackageScriptsPresent/detectLicensePresent/detectCiConfigPresent/detectTestsDirPresent + step11 W1-A FAIL → P2 finding 변환 + §1 default-pass 표 + 19 new tests (audit-core 222 PASS / audit-worker 245 PASS) |
| T1.3 | 01 W1-B Step 11 80+ 체크리스트 ID 매핑 | A1-W1-B / A4-UPG-03 | P1 | M (2d) | ✅ | w5-risky-discovery — w1b-checklist.ts + render-markdown §7 |
| T1.3-FU | W1-B 80+ ID 확장 (category × pattern grid: 6 baseline + 77 fine = 83 IDs) | A1-W1-B | P1 | M (1d) | ✅ | w5-risky-discovery — W1B_FINE_PATTERNS + getW1BIdByName + step18 dual-tag emit + render-markdown 세부 패턴 매칭 sub-section + 13 new unit tests |
| T1.4 | 03-A SEVERITY_LANGUAGE_KO 표준화 + finding-card 통합 | A2-03-A | P1 | M (2d) | 🔄 | ts-pro (i18n 모듈 완료, finding-card 통합 미진행) |
| T1.5 | 03-D Confidence chip (UI 신설) — false alarm 가드 | A2-03-D | P1 | S (1d) | ✅ | ts-pro — confidence-chip.tsx + findings-table/finding-detail-panel 통합 (HIGH=green, MEDIUM=amber, LOW=gray, aria-label) |
| T1.6 | 04-A Cold start UX + min-instances prod=1 분리 | A2-04-A | P1 | S (1d) | 🔄 | u2-mock-typename (대기화면 UI 완료: cold-start-meta.tsx + cold-start-skeleton.tsx + page.tsx 통합 + ETA/자동갱신/수동새로고침; min-instances는 infra task로 분리 필요); **#96 T1.6-FU Cloud Run min-instances: pre-launch 직전 처리 예정** |
| T1.7 | 04-B Lighthouse adaptive throttling | A2-04-B | P1 | M (2d) | ✅ | u2-mock-typename (lighthouse-profile.ts + 09-analyze-deploy-url 통합; LIGHTHOUSE_PROFILE env [mobile-slow4G default / mobile-fast4G / desktop-cable / desktop-no-throttle]; finding metadata.profileId + tag profile:* + rawSummary.profile; unknown 값은 default fallback + warn log; 19 tests pass) |

---

## Phase 2 (UX + 기능 확장, ~5주)

| ID | 항목 | 출처 | P | Effort | 상태 | 담당 |
|----|------|------|---|--------|------|------|
| T2.1 | 01 W2-C PRD 분석 step 04c 신설 (No-LLM 키워드 매칭) — ANALYZE_PRD step 19(slot 5) 파이프라인 삽입 | A1-W2-C / A4-UPG-04 | P1 | M (3d) | ✅ | Sprint 2 — ANALYZE_PRD step `packages/shared-types/src/audit-steps.ts` slot 5 (index 4) |
| T2.2 | 01 W2-D recordStepOutcome 헬퍼 — BUG-1과 수렴, CHECKPOINT만 | A1-W2-D | P1 | S (1d) | ✅ | Sprint 2 |
| T2.3 | 03-B 3-layer progressive disclosure | A2-03-B / A4-UPG-11 | P1 | L (4d) | ✅ | Sprint 2 |
| T2.4 | 02-B 감사 프로필 템플릿 (Landing/SaaS/Ecommerce) | A1-02-B | P1 | S (2d) | ✅ | mvp-planner (packages/audit-core/src/profiles/index.ts 3 profiles [landing/saas/ecommerce] with emphasizedCategories + weightOverrides + mandatoryEvidence; AuditRunSchema.profileId + CreateAuditRunRequestSchema.profileId optional [free string, audit-core resolves via getProfile→null on unknown for legacy-doc safety]; WorkerCtx.profileId forwarded by runner.ts; step12 calls getProfile(ctx.profileId) and passes to calculateScores; applyProfileWeights no-op when profile=null preserves spec default; url-input-form.tsx native <select> with PROFILE_IDS allowlist + isProfileId guard; ko/en i18n 6 keys each; 271/271 worker tests + 304/304 audit-core + 157/157 shared-types green) |
| T2.5 | 02-C 재감사 diff 시각화 — dogfood 가능 (`/audits/[id]/diff` route 신설) | A1-02-C | P1 | M (4d) | ✅ | Sprint 2 — apps/web/app/audits/[id]/diff/page.tsx + compute-run-diff.ts |
| T2.6 | 02-E False positive 피드백 루프 UI 토글 — R4 4건 검증 | A1-02-E | P1 | S (1.5d) | ✅ | Sprint 2 |
| T2.7 | L3 RULE_FAMILY_EXPLANATIONS 19→40개 확장 (No-LLM 우선) | A3-L3 | P1 | S (3d) | ✅ | Sprint 2 |
| T2.8 | UPG-06 Business Readiness Phase 1+2 (ANALYZE_BUSINESS_READINESS step, slot 14; weight=0 default-pass; BUSINESS_READINESS AuditCategory 추가 → 카테고리 총 12개) | A4-UPG-06 | P1 | M (5d) | ✅ | Sprint 2 — packages/shared-types/src/enums.ts + audit-steps.ts slot 14 |
| T2.9 | 03-C 샘플 Repo 갤러리 | A2-03-C | P2 | M (3d) | ✅ | Sprint 2 |
| W2-A | PRD Upload (textarea + 파일 업로드, 50KB cap, API 422, worker merge) | W2-A PRD | P1 | S (~1.5d) | ✅ | 2026-05-17 — prd-input.tsx (135L) + url-input-form PrdInput 통합 + create-audit-run 50KB cap + PrdTextTooLargeError 422 + 04c-analyze-prd userPrdText merge + i18n 4 keys ko/en + 8 new tests |
| T2.10 | 02-F 감사 히스토리 대시보드 (T2.5와 묶음) | A1-02-F | P2 | S (2d) | ⏳ | — |
| T2.11 | 03-G 모바일 폴리시 — #42와 동일 영역 | A2-03-G | P2 | M (3d) | ✅ | Sprint 2 |
| T2.12 | 04-E PartialResultBanner N/A 카테고리 라벨 강화 | A2-04-E | P2 | S (1d) | ✅ | Sprint 2 |
| T2.13 | 04-G 관측성 메트릭 (Cloud Monitoring IaC) | A2-04-G | P2 | M (3d) | ✅ | Sprint 2 |
| T2.14 | #42 feature-graph adapter 테스트 (T2.11과 묶음) | 기존 | P2 | S (1d) | ⏳ | — |
| T2.15 | #45 exactOptionalPropertyTypes + PipelineState — T1.4 선행 필요 | 기존 | P1 | M (2d) | 🔒 DEFERRED | #45 d1-prd-schema: long-running, pre-launch 직전 처리 |

---

## Phase 3 (LLM BYOK + 인프라, ~4주) — 보안 우선

| ID | 항목 | 출처 | P | Effort | 상태 | 담당 |
|----|------|------|---|--------|------|------|
| **T3.1** | **BYOK 인프라 P0**: KMS + redactor + `Buffer.fill(0)` zeroization | A3 보안 1-3 | **P0** | L (2주) | ⏳ | — |
| T3.2 | Prompt injection 가드 (system prompt isolation) | A3 보안 5 | P1 | S (2d) | ⏳ | — |
| T3.3 | L1 PRD 매칭 step 04c LLM 옵션 (T2.1 No-LLM 후) | A3-L1 | P1 | M (1주) | ⏳ | — |
| T3.4 | L2 composeOneLineSummary LLM wrapper + graceful degradation | A3-L2 | P2 | S (2d) | ⏳ | — |
| T3.5 | LLM Adapter 패턴 + Firestore cache + Budget tracker | A3 / A4-UPG-07 | P1 | M (1주) | ⏳ | — |
| T3.6 | UI LLM 토글/배지 + 코드 전송 동의 modal | A3 보안 4 | P2 | S (3d) | ⏳ | — |
| T3.7 | 01 W3-E Tree-sitter 통합 (Docker +5MB, cold start +200ms) | A1-W3-E / A4-UPG-05 | P2 | L (4d) | ⏳ | — |
| T3.8 | 01 W3-F Ghost Button / Fake Flow heuristics (W3-E 의존) | A1-W3-F | P2 | M (2d) | ⏳ | — |
| T3.9 | P2-D 공유 링크 (Firestore rules만) | A3-P2-D | P2 | S (1주) | ⏳ | — |

---

## Backlog FUTURE (외부 사용자/MAU 게이트 후)

| ID | 항목 | 출처 | 게이트 조건 |
|----|------|------|------------|
| B-02-A | 멀티 프레임워크 어댑터 (6종) | A1-02-A | 외부 사용자 확보 |
| B-02-D | GitHub Action CI 통합 | A1-02-D | 02-C/B 안정화 |
| B-02-G | 다국어 (EN/JA) | A1-02-G | Korean baseline 안정 |
| B-02-H | Webhook / Slack 알림 | A1-02-H | Phase 2 끝물 |
| B-03-E | 가이드 투어 | A2-03-E | Tour 도구 의존 |
| B-03-F | 다크모드 토글 | A2-03-F | next-themes 도입 |
| B-03-H | 재감사 CTA (02-C 의존) | A2-03-H | T2.5 완료 후 |
| B-04-H | E2E Playwright 영구 fix | A2-04-H | 사용자 결정 대기 |
| B-L4 | LLM PRD Epic 시퀀싱 | A3-L4 | PRD shape 변경 필요 |
| B-P2-A | Private Repo (token 주입) | A3-P2-A | Sprint 4 이후 |
| B-P2-B | 로그인 분석 | A3-P2-B | ToS 확인 필요 |
| B-P2-C | GitLab/Bitbucket 어댑터 | A3-P2-C | MAU 게이트 |
| B-P2-E | 룰셋 마켓 | A3-P2-E | 사용자 인터뷰 후 |
| B-P2-F | Free vs Pro tier | A3-P2-F | 비즈 모델 확정 후 |
| B-P3-A | 팀 워크스페이스 | A3-P3-A | MAU 500+ |
| B-P3-C | 리더보드 | A3-P3-C | 게임화 결정 후 |
| B-P3-D | 외부 API + CLI | A3-P3-D | MAU 500 + 유료 5% |
| B-P3-E | Slack/Discord 봇 | A3-P3-E | Phase 3 후반 |
| B-P3-F | 다국어 정식 출시 | A3-P3-F | Phase 3 |

---

## 🚫 IGNORED (이미 완료 또는 ROI 미입증)

| ID | 항목 | 사유 |
|----|------|------|
| ✅ 04-D | anonymous user cleanup | daily-cleanup.ts에 완전 구현됨 (03:00 KST, batch 500, 7d/30d) |
| ✅ 04-C | Cloud Tasks retry | infra/terraform/tasks.tf 완료 (max_attempts=3, backoff 10-300s) |
| 🚫 P3-B | Figma 비교 | 설계안 자체 "ROI 검증 후" 명시 |
| 🚫 P4 온프렘 | self-hosting | 6개월+, MVP 외, Firebase/Cloud Run 깊은 의존 |
| 🚫 P4 컴플라이언스 팩 | SOC2/ISO/K-ISMS | enterprise 진입 후 |
| 🚫 P4 AI Code Review Agent | 자동 PR 작성 | "명시적 NO" 정책 |
| 🚫 자체 LLM 학습 | — | "명시적 NO" |
| 🚫 자동 수정 PR | — | "명시적 NO" |
| 🚫 무료 LLM 제공 | — | "명시적 NO" (BYOK only) |
| 🚫 IDE 통합 | VS Code/JetBrains | "명시적 NO" |
| 🚫 모바일 네이티브 | iOS/Android | "명시적 NO" (모바일 웹은 03-G) |

---

## 🔒 외부 블로커 (사용자 결정 필요)

| ID | 항목 | 상태 |
|----|------|------|
| EXT-1 | Firebase 자격증명 (콘솔/결제) | 🔒 BLOCKING |
| EXT-2 | Cloud Tasks 워커 URL (콘솔 배포) | 🔒 BLOCKING |
| ✅ EXT-3 | Git 원격 저장소 가시성 | DONE — Yoodaddy0311/cleartoship public push (7809ba6) |

---

## 라운드3/4 정합성 검증

| 라운드4 발견 | 통합 TODO 매핑 |
|---|---|
| launchStatus=INDETERMINATE | T1.2 (W1-A measuredBy) — root cause 직격 |
| 5개 도구 미실행 | T0.5 환경 정상화 — 라운드5 sanity |
| O1-O4 완료 (a/c/d 0건, b 단위테스트) | ✅ commit 7809ba6 |
| risky 4건 모두 P2 false-positive 미검증 | T2.6 (02-E FP 피드백 루프) |
| README 라벨 stale | T0.1 (W1-Z / P0-03) |
| BUG-1 5 step 산재 | T2.2 (recordStepOutcome) — 이미 수렴 CHECKPOINT |

---

## Total effort

| Phase | Effort | Duration (1팀) |
|-------|--------|----------------|
| Phase 0 | ~3d | 3일 |
| Phase 1 | ~12d | 2주 |
| Phase 2 | ~36d | 5주 |
| Phase 3 | ~25d | 4주 |
| **Total Phase 0-3** | **~76d** | **~3개월** |

---

## Sprint 3 진입점 (2026-05-17)

Sprint 2 완료 후 남은 주요 작업:

| 우선순위 | 항목 | 비고 |
|---------|------|------|
| P1 | T1.4 SEVERITY_LANGUAGE_KO finding-card 통합 | i18n 모듈 완료, finding-card 통합 미진행 |
| P1 | T1.6 #96 Cloud Run min-instances | pre-launch 직전 처리 |
| P2 | T2.10 감사 히스토리 대시보드 | T2.5 diff route 완료 후 묶음 처리 |
| P2 | T2.14 feature-graph adapter 테스트 | T2.11 모바일 폴리시 완료 후 묶음 |
| DEFERRED | #45 d1-prd-schema exactOptionalPropertyTypes + PipelineState | T1.4 완료 후 |

**빌드/테스트 기준**: 1461/1461 PASS (shared-types 157 + ui 54 + audit-core 304 + functions 32 + audit-worker 288 + apps/web 626)

---

## Sprint 4 Wave 진행 (2026-05-19 ~ 2026-06-05)

상위 PRD: `docs/PRD/sprint4-execution-plan-2026-05-18.md` (Sharpen PRD §B/§C/§D).
Launch Target: **2026-06-05**.

### Wave 1 — Sharpen Cores ✅ DONE (PR #1)

| Work Unit | 항목 | 산출물 |
|-----------|------|--------|
| W1.B1.1 | FCSResult zod schema | `packages/shared-types/src/fcs.ts` |
| W1.B1.2 | computeFCS algorithm | `packages/audit-core/src/fcs/compute-fcs.ts` |
| W1.B1.3 | calculate-scores 통합 | `packages/audit-core/src/scoring/calculate-scores.ts` |
| W1.B1.5 | LaunchStatus 7-enum derive | (compute-fcs.ts 내부 로직) |
| W1.B1.7 | FCS UI gauge + uncertainty | `apps/web/components/founder-confidence-score.tsx` |
| W1.B1.8 | FCS i18n ko/en 16 키 | `apps/web/lib/i18n/{ko,en}.ts` |

ShipVerdictBanner / TopConcernsList / Phase5 PRD skeleton / War Room ADR는 Wave 1 deliverable에서 자연스럽게 Wave 2/3로 이연.

### Wave 2 — Insight Reorg + P1 7건 ✅ DONE (PR #3 #4 #5 #6 #7)

| Work Unit | 항목 | 산출물 |
|-----------|------|--------|
| L-P1-1 | ProfileBadge | `apps/web/components/profile-badge.tsx` |
| L-P1-2 | feature-graph adapter test | `packages/audit-core/src/feature-graph/adapter.test.ts` (7 cases) |
| L-P1-3 | Narrative 3-sentence template | `packages/audit-core/src/narrative/render-narrative.ts` + `apps/web/components/narrative.tsx` |
| L-P1-4 | EvidencePanel collapse persist | `apps/web/lib/ui/use-persistent-collapse.ts` + `apps/web/components/evidences/evidence-panel.tsx` |
| L-P1-5 | ko/en LangToggle | `apps/web/lib/i18n/locale.ts` + `apps/web/components/common/lang-toggle.tsx` + `apps/web/app/actions/revalidate-lang.ts` |
| L-P1-6 | Skeleton 3종 | `apps/web/components/skeletons/{ship-verdict,score,narrative}-skeleton.tsx` |
| L-P1-7 | Mobile 360px regression | `apps/web/e2e/visual/mobile-360.spec.ts` (6 cases) |
| W2.C5 | Next30MinChecklist + hook | `apps/web/components/next-30min-checklist.tsx` + `apps/web/lib/ui/use-persistent-checklist.ts` |
| W2.C6 | CategoryGrid 2×6 enhance | `apps/web/components/dashboard/category-grid.tsx` (weights + onClick + placeholder) |
| W2.C7 | FindingsTable filter+sort + URL sync | `apps/web/components/findings/{findings-table,finding-filters}.tsx` |
| W2.C8 | CoverageMatrix UI | `apps/web/components/coverage-matrix.tsx` (4 badge variants) |
| W2.C10 | RunMetadataStrip | `apps/web/components/common/run-metadata-strip.tsx` |
| W2.C-i18n | 17 신규 키 ko/en parity + 4 컴포넌트 마이그레이션 | `apps/web/lib/i18n/{ko,en}.ts` (291 keys each) |
| 보너스 | Hero SpecialText brand reveal | `apps/web/components/marketing/special-text.tsx` |

Wave 2 종합: **+118 신규 테스트**, web 98 files / 742 tests PASS, audit-core 19 files / 429 tests PASS.

### Wave 3 — Doc + Hardening 🔄 IN PROGRESS

| Batch | 범위 | 상태 |
|-------|------|------|
| Docs (W3.DOC.1/2 + W3.MIG.1) | ROADMAP + Migration 5-step | 🔄 진행 중 (본 ROADMAP edit + `docs/MIGRATIONS/2026-05-19-add-fcs-field.md` 신규) |
| Cleanup (W3.CLN.1~4) | ghostButton fix + truncate util + primaryPath fallback + tie-break | 🔄 부분 — 2/4 진행 중 (truncate + primaryPath), 2건은 Wave 3-2 |
| Infra (W3.INF.1~5) | deploy.yml 주석 + Cloud Tasks tune + Firestore index + monitoring dashboard + alert policy | ✅ DONE (working tree) |
| QA (W3.QA.1/2) | DATA POLICY audit + forbidden-word lint | ✅ DONE — 0 위반 |

### Wave 4 — TBD (planning)

Sharpen PRD §A.2 P1 잔여, §D.4 분량. Wave 4 dispatch 직전에 본 ROADMAP에 work unit 추가.

### Wave 5 — Pre-launch (2026-06-03 ~ 2026-06-05) ⏳ PLANNING

- 최종 DATA POLICY audit re-run
- Manual smoke (golden path × 3 sample repos)
- Cloud Run health check + min-instance=1 동작 검증
- Launch Gate G5 통과

---

## 변경 이력

| 날짜 | 변경 | 작성자 |
|------|------|--------|
| 2026-05-18 | Sprint 4 Wave 3 Batch E: Sprint 4 Wave 진행 섹션 추가 (Wave 1 ✅ / Wave 2 ✅ / Wave 3 🔄 / Wave 4-5 PLANNING) + Migration doc 추가 | leader (Sprint 4 Wave 3) |
| 2026-05-18 | W2-A PRD Upload 완료: prd-input.tsx 신규 + url-input-form 통합 + API 422 + worker merge + 8 new tests (총 1469 PASS) | code-reviewer cross-check |
| 2026-05-17 | Sprint 2 완료 반영: T2.1~T2.13 체크, 20-step 파이프라인, 12 카테고리, 3 profiles, diff route, deferred 항목 명시, Sprint 3 진입점 추가 | doc-updater sync |
| 2026-05-17 | 최초 작성 (LLM/01~06 + Audit_Report + Blueprint 통합 + Round 1~4 결과 반영) | /team leader synthesis |
