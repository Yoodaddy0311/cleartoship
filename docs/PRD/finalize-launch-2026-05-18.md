# PRD: ClearToShip Launch Finalization (2026-05-18)

**작성일**: 2026-05-18
**작성자**: planner (Opus 4.7) — design-only, no code change
**기준 데이터**: `docs/ROADMAP.md` 2026-05-18 시점, `packages/shared-types/src/{enums.ts, audit-steps.ts}`, `README.md`, `docs/PRD/{w2a-prd-upload.md, sprint3-wrap-ap-20260517-014225.md}`
**목적**: 런치 직전 잔여 기능 회수 + USP 강화 + 인사이트 전달 재설계의 단일 SSOT

---

## §1. 현재 상태 (Context Packet)

### §1.1 ROADMAP Phase별 잔여 항목

| Phase | 항목 수 | DONE | 잔여(🔄/⏳) | Effort 잔여 | 출처 |
|---|---|---|---|---|---|
| 이미 완료 (Round 1~4) | 13 | 13 | 0 | — | ROADMAP §"이미 완료" |
| Phase 0 (즉시) | 5 | 5 | 0 | — | ROADMAP §"Phase 0" |
| Phase 1 (MVP) | 8 | 7 | 2 (T1.4, T1.6) | ~3d | ROADMAP §"Phase 1" |
| Phase 2 (UX+확장) | 15 | 13 | 2 (T2.10, T2.14) + 1 deferred (T2.15) | ~5d | ROADMAP §"Phase 2" |
| Phase 3 (LLM BYOK) | 9 | 0 | 9 | ~25d | ROADMAP §"Phase 3" |
| Backlog FUTURE | 19 | 0 | 19 (게이트 조건부) | — | ROADMAP §"Backlog" |
| IGNORED | 8 | 8 | 0 | — | ROADMAP §"IGNORED" |

**Phase 1 잔여 상세**

| ID | 항목 | 현재 진척 | 후속 작업 |
|---|---|---|---|
| T1.4 | 03-A SEVERITY_LANGUAGE_KO 표준화 + finding-card 통합 | i18n 모듈 완료, finding-card 통합 미진행 | finding-card.tsx / finding-detail-panel.tsx에 ko 매퍼 주입, 회귀 테스트 |
| T1.6 | 04-A Cold start UX + min-instances prod=1 | 대기화면 UI 완료(cold-start-meta.tsx, cold-start-skeleton.tsx, page.tsx 통합) | #96 Cloud Run min-instances는 infra task로 분리, pre-launch 직전 처리 |

**Phase 2 잔여 상세**

| ID | 항목 | 의존 | 비고 |
|---|---|---|---|
| T2.10 | 02-F 감사 히스토리 대시보드 | T2.5 diff route 완료 후 | 사용자 인지 향상 효과 ↑ |
| T2.14 | #42 feature-graph adapter 테스트 | T2.11 완료 후 묶음 | regression 안전망 |
| T2.15 | #45 d1-prd-schema (exactOptionalPropertyTypes + PipelineState) | T1.4 선행 필요 | 🔒 DEFERRED, long-running |

**Phase 3 (LLM BYOK) 전 9건 PENDING**

| ID | 항목 | P | Effort |
|---|---|---|---|
| T3.1 | BYOK 인프라 P0: KMS + redactor + Buffer.fill(0) | **P0** | L (2주) |
| T3.2 | Prompt injection 가드 | P1 | S (2d) |
| T3.3 | L1 PRD 매칭 step 04c LLM 옵션 | P1 | M (1주) |
| T3.4 | L2 composeOneLineSummary LLM wrapper | P2 | S (2d) |
| T3.5 | LLM Adapter + Firestore cache + Budget tracker | P1 | M (1주) |
| T3.6 | UI LLM 토글/배지 + 코드 전송 동의 modal | P2 | S (3d) |
| T3.7 | W3-E Tree-sitter (Docker +5MB, cold start +200ms) | P2 | L (4d) |
| T3.8 | W3-F Ghost Button / Fake Flow (W3-E 의존) | P2 | M (2d) |
| T3.9 | P2-D 공유 링크 | P2 | S (1주) |

### §1.2 12 카테고리 × 20-step 파이프라인 구현 상태 매트릭스

> 출처: `packages/shared-types/src/audit-steps.ts` (실제 20 step) + `packages/shared-types/src/enums.ts` (12 category). ROADMAP은 "18-step"으로 표기되나 audit-steps.ts에는 ANALYZE_PRD(slot 5)와 ANALYZE_BUSINESS_READINESS(slot 14) 포함 20-step이 SSOT.

**Step 구현 상태**

| # | Step | 상태 | 비고 |
|---|---|---|---|
| 1 | VALIDATE_INPUT | DONE | 기존 검증 통합 |
| 2 | FETCH_REPO_METADATA | DONE | — |
| 3 | CLONE_REPO | DONE | T1.1b repo size cap 통합 |
| 4 | ANALYZE_PROJECT_STRUCTURE | DONE | W1-A detectors 5종 (T1.2-FU) |
| 5 | ANALYZE_PRD | DONE | T2.1 + W2-A userPrdText merge 완료 |
| 6 | DETECT_FEATURES | DONE | — |
| 7 | RUN_STATIC_ANALYSIS | DONE | Semgrep |
| 8 | DISCOVER_RISKY_FUNCTIONS | DONE | R4 O1-O4 fix |
| 9 | RUN_DEPENDENCY_SCAN | DONE | OSV dedup |
| 10 | RUN_SECRET_SCAN | DONE | — |
| 11 | ANALYZE_DATA_MODEL | DONE | — |
| 12 | ANALYZE_DEPLOY_URL | DONE | T1.7 Lighthouse adaptive throttling |
| 13 | CHECK_DESIGN_CONSISTENCY | DONE | — |
| 14 | ANALYZE_BUSINESS_READINESS | DONE | T2.8, weight=0 default-pass |
| 15 | GENERATE_FEATURE_GRAPH | DONE | T2.14 adapter test 잔여 |
| 16 | MAP_CHECKLIST | DONE | W1-B 80+ ID 매핑 |
| 17 | CALCULATE_SCORES | DONE | confidence-weighted scoring, profile weight |
| 18 | GENERATE_REPORT | PARTIAL | §3 인사이트 강화 항목 미적용 |
| 19 | GENERATE_IMPROVEMENT_PRD | DONE | render-markdown 통합 |
| 20 | CLEANUP | DONE | — |

**12 카테고리 × 핵심 Step 매핑**

| Category | 주요 Step | 상태 | 갭 |
|---|---|---|---|
| PRODUCT_INTENT | 5 ANALYZE_PRD | DONE | LLM 보강 (T3.3) PENDING |
| REQUIREMENT_COVERAGE | 5, 16 | DONE | W1-B fine pattern 검증 필요 |
| FEATURE_GRAPH | 6, 15 | DONE | adapter test (T2.14) 잔여 |
| FUNCTIONAL_FLOW | 6, 12 | PARTIAL | Ghost Button/Fake Flow (T3.8) PENDING |
| UX_UI | 12, 13 | DONE | axe/lighthouse 통합 OK |
| FRONTEND_CODE | 7, 8 | DONE | — |
| BACKEND_API | 8, 11 | DONE | — |
| DATA_MODEL | 11 | DONE | — |
| SECURITY_PRIVACY | 9, 10 | DONE | BYOK 시 redactor (T3.1) 필요 |
| LAUNCH_READINESS | 14, 17 | DONE | T1.6 cold start min-instances 잔여 |
| MAINTAINABILITY_DOCUMENTATION | 4, 16 | DONE | UI는 main 10 표시, finding emit 유지 |
| BUSINESS_READINESS | 14 | DONE | weight=0 default-pass (Phase 1 의도) |

### §1.3 Sprint 2 결과 요약 (2026-05-17)

- **총 47 task 완료** (ROADMAP §"Sprint 3 진입점" + §"변경 이력" 통합)
- **빌드/테스트**: 1461/1461 PASS — shared-types 157 + ui 54 + audit-core 304 + functions 32 + audit-worker 288 + apps/web 626
- **W2-A 추가 후**: 8 new tests → 1469 PASS (변경 이력 2026-05-18 행)
- **주요 마일스톤**: 20-step 파이프라인 확정, 12 카테고리 + BUSINESS_READINESS 추가, 3 audit profiles (landing/saas/ecommerce), `/audits/[id]/diff` route 신설, PRD Upload 50KB cap + 422
- **Deferred**: #45 d1-prd-schema, #96 T1.6-FU Cloud Run min-instances
- **남은 Sprint 3 진입점**: T1.4(P1), T1.6 #96(P1), T2.10(P2), T2.14(P2), #45(deferred)

---

## §2. 차별화 갭 분석 (USP 발굴)

### §2.1 경쟁군 비교 표

| 도구 | 강점 | 약점 | ClearToShip 대비 |
|---|---|---|---|
| **SonarQube** | 정적 분석 깊이, 다언어, 룰셋 방대 | 비즈니스/UX/PRD 인식 부재, "출시 가능?" 답 못함 | ClearToShip은 "ship readiness 단일 점수" 산출 |
| **Snyk** | 의존성/시크릿 보안 최강 | 보안 단일 축, UX/PRD 무관심 | ClearToShip은 12 카테고리 전 영역 |
| **Lighthouse** | 무료, 빠른 성능/접근성 진단 | 코드 품질·아키텍처·요구사항 미진단 | ClearToShip은 코드+UX+비즈니스 통합 |
| **CodeQL** | 보안 변동성 추적, query 강력 | 학습 곡선 가파름, 비즈니스 무인지 | ClearToShip은 No-LLM 즉시 사용 가능 |
| **Vercel Analytics** | 런타임 Core Web Vitals 실측 | "배포 전" 진단 불가 | ClearToShip은 pre-deploy 진단 |
| **GitHub Copilot Workspace** | 작성 보조, AI 첨삭 | 출시 준비도 측정 부재, 인사이트 정리 약함 | ClearToShip은 "출시 가능?"에 1줄로 답 |

### §2.2 ClearToShip만의 핵심 차별점 3가지

#### USP-1: 바이브 코딩 산출물 전용 진단 (Vibe-Coded Output Auditor)

- **정의**: AI 짝코딩, 스피드런, 해커톤 등 "빠르게 만든 산출물"에 특화된 진단 룰셋 — typical 안티패턴(미사용 import 폭증, ghost button, half-implemented flow, mock data 잔존, .env leak, "TODO" 산재)을 우선 검출.
- **기존 갭**: 경쟁군은 enterprise 코드 가정. 바이브 코딩 특유의 "겉은 멀쩡, 속은 ghost" 패턴을 못 잡음.
- **강화 기능**:
  - **VIBE_CODING_RISK_PROFILE** — 신규 audit profile 4번째 ("vibe-coded") 추가 → emphasizedCategories = [FUNCTIONAL_FLOW, UX_UI, LAUNCH_READINESS], W3-F Ghost Button heuristics 강제 활성.
  - 리포트 상단에 "바이브 코딩 위험 패턴 N건 발견" 배지.
  - UI label: "Vibe-Coded? Audit it before you ship."

#### USP-2: PRD-aware Audit (요구사항 vs 구현 매칭)

- **정의**: 사용자가 PRD를 업로드(W2-A 완료)하면 step 5 ANALYZE_PRD가 "요구사항 → 구현 증거" 1:1 매칭 표를 생성. 미구현 클레임은 P0/P1으로 자동 승급.
- **기존 갭**: 경쟁군 어떤 도구도 "PRD에 적힌 기능이 실제 구현됐는지"를 검증하지 못함. ClearToShip만의 W1-A measuredBy 체계가 이를 가능케 함.
- **강화 기능**:
  - **PRD Coverage Matrix** — 리포트 §2에 "PRD 클레임 X개 중 N개 충족 / M개 미흡 / K개 불명확" 표.
  - 미충족 클레임마다 "어떤 파일/라우트가 있어야 하는가?" recommended_feature 노드 자동 생성 (feature-graph 통합).
  - LLM BYOK 활성 시 (T3.3) PRD 자연어 → 구조화 클레임 자동 추출.

#### USP-3: Ship-Readiness 단일 점수 + 1줄 결론 (One-Glance Verdict)

- **정의**: 12 카테고리 가중 점수를 종합한 단일 0~100 "Ship Score" + "이 코드는 배포 가능한가?" 1줄 결론을 리포트 최상단에 표시. (현재는 카테고리별 점수만 나열, 1줄 결론 부재가 §3의 핵심 문제)
- **기존 갭**: SonarQube=품질만, Snyk=보안만, Lighthouse=성능만. "전체적으로 배포 가능?"에 단일 답을 주는 도구 없음.
- **강화 기능**:
  - **Ship Verdict**: `READY` / `READY_WITH_CAVEATS` / `NEEDS_WORK` / `BLOCKED` 4단계 라벨 + 1줄 사유.
  - **Blocker Spotlight**: P0 finding 최대 3개만 상단에 노출 ("이 3건만 해결하면 ship 가능").
  - **Confidence Disclaimer**: "Confidence=LOW finding 비중이 30% 초과 시 BYOK LLM으로 재검증 권장" 배너.

### §2.3 USP를 강화하기 위한 추가 기능/UX 제안

| 기능 | USP 연결 | 우선순위 | Effort |
|---|---|---|---|
| Vibe-Coded profile 추가 (4번째 profile) | USP-1 | P1 | S |
| Ghost Button heuristic 우선 구현 (T3.8을 T3.7과 분리) | USP-1 | P1 | M |
| PRD Coverage Matrix 리포트 섹션 | USP-2 | **P0** | M |
| Ship Verdict 4단계 + 1줄 사유 generator | USP-3 | **P0** | S |
| Blocker Spotlight (P0 top-3) | USP-3 | **P0** | S |
| Confidence disclaimer 배너 | USP-3 | P1 | XS |
| 랜딩페이지 "Vibe-Coded? Audit it." 카피 | USP-1 | P1 | XS |

---

## §3. 인사이트 전달 강화 설계 (UX 재설계)

### §3.1 현재 문제 정의

현재 리포트 (`packages/audit-core/src/render-markdown.ts`)는:
- §1 요약: launchStatus + categoryScore 표 나열
- §2~§7: 카테고리별 finding 표 + W1-A 표 + W1-B fine pattern 표
- **결론 부재**: "그래서 ship 가능?"에 1줄로 답 못함
- **내러티브 부재**: 카테고리 순회 = 보고서가 아닌 데이터 덤프
- **액션 부재**: finding 옆에 "지금 뭘 해야?" 명시 안 됨
- **비교 기준점 부재**: P50/P90이나 직전 run 대비 변화 없음 (T2.5 diff는 별도 페이지)
- **신뢰도 시그널 약함**: confidence chip(T1.5)은 finding 단위만, 리포트 전체 신뢰도 미표시

### §3.2 강화 항목 5개

#### §3.2.1 One-shot Conclusion (보고서 최상단 한 줄 결론)

**위치**: 리포트 헤더 직후, §1 위.

**텍스트 모형**:
```
========================================
[SHIP VERDICT]  NEEDS_WORK  Confidence: HIGH
========================================
이 코드는 프로덕션 배포 전 P0 3건 해결 필수
— Top blockers: ① .env.production 누출 (SECRET_SCAN)
                ② /api/admin 인증 가드 누락 (BACKEND_API)
                ③ 메인 CTA 버튼 dead handler (UX_UI, ghost button)

Ship Score: 64/100  (P50: 71, P90: 88 — 동종 SaaS 대비 하위 30%)
========================================
```

**산출 규칙**:
- Verdict = `BLOCKED` if P0≥1 with HIGH confidence; `NEEDS_WORK` if P0≥1 or P1≥5; `READY_WITH_CAVEATS` if P1<5 and P0=0; `READY` if no P0/P1 with HIGH/MEDIUM confidence.
- 1줄 사유는 카테고리별 가장 심각한 finding의 title 기반 자동 생성 (LLM 불요).

**구현 위치**: `packages/audit-core/src/render-markdown.ts` 신규 함수 `renderShipVerdict(scores, findings, profile)` + 헤더 prepend.

#### §3.2.2 Narrative Summary (카테고리 점수를 스토리로)

**현재**: 12개 점수 표 나열.
**개선**: BUSINESS → UX → PERF → SEC 흐름의 1단락 스토리.

**텍스트 모형**:
```
## 한 눈에 보는 진단

이 프로젝트는 [USP-2 PRD-aware] PRD에 적힌 기능 8개 중 6개가 구현되었고,
[BUSINESS_READINESS] 가격/약관 페이지가 누락된 상태에서 [UX_UI] 메인 플로우는
대체로 매끄러우나 모바일 viewport에서 CTA 1건이 클릭되지 않으며, [FRONTEND_CODE]
정적 분석은 무난하지만 [SECURITY_PRIVACY] .env.production 파일이 commit되어
즉시 회수가 필요합니다. [LAUNCH_READINESS] Cold start ETA는 3.2초로 사용자
이탈 우려가 있어 min-instances=1 적용을 권장합니다.
```

**생성 규칙**:
- 카테고리 순회 순서: PRODUCT_INTENT → REQUIREMENT_COVERAGE → BUSINESS_READINESS → UX_UI → FRONTEND_CODE → BACKEND_API → DATA_MODEL → SECURITY_PRIVACY → LAUNCH_READINESS
- 각 카테고리당 1문장, P0/P1 finding이 있으면 그 finding의 핵심 키워드를 sentence에 포함
- 템플릿 기반 (No-LLM) — `packages/audit-core/src/render-narrative.ts` 신규

**구현 위치**: `packages/audit-core/src/render-narrative.ts` (신규) + render-markdown 통합.

#### §3.2.3 Actionable Next Step (finding 옆 "지금 할 일")

**현재 finding 표**:
| Severity | Confidence | Title | Category |
|---|---|---|---|
| P0 | HIGH | .env.production committed | SECURITY_PRIVACY |

**개선 finding 표**:
| Severity | Confidence | Title | Category | 지금 할 일 (예상 작업량) |
|---|---|---|---|---|
| P0 | HIGH | .env.production committed | SECURITY_PRIVACY | `git rm --cached .env.production` + .gitignore 추가 + 노출 키 rotate **(5분)** |
| P1 | MEDIUM | CTA button has dead handler | UX_UI | `onClick` 핸들러 구현 또는 disabled prop 추가 **(30분)** |
| P2 | LOW | Missing license file | MAINTAINABILITY_DOCUMENTATION | `LICENSE` 파일 추가 (MIT 템플릿 권장) **(5분)** |

**작업량 분류 규칙**:
- **5분**: 단일 라인 수정, 파일 추가/삭제, 환경변수 정리
- **30분**: 함수/컴포넌트 수정, 단일 핸들러 구현, 1개 라우트 가드 추가
- **1시간**: 다중 파일 리팩토링, 신규 페이지 추가, 의존성 교체
- **반나절+**: 아키텍처 변경, 다수 카테고리 횡단

**구현 위치**: `packages/audit-core/src/finding-action-hints.ts` (신규) — finding type별 hint 사전. Finding metadata에 `actionHint: { text, etaMinutes }` 추가 (zod schema 변경 필요 → shared-types 전 테스트 재실행 필수, **feedback_full_test_run.md** 준수).

#### §3.2.4 비교 기준점 (P50/P90 + 직전 run 대비)

**현재**: 절대값만 표시.
**개선**:
```
Ship Score: 64/100
  ├─ 동종 SaaS 프로젝트 P50: 71 (당신은 하위 30%)
  ├─ 동종 SaaS 프로젝트 P90: 88 (상위 10% 진입까지 24점)
  └─ 직전 run (2일 전, runId: aK7q2): 58 → +6점 ▲

카테고리별 변화:
  SECURITY_PRIVACY  82 → 71 ▼ (-11)  ← 회귀 주의
  UX_UI             60 → 72 ▲ (+12)
  LAUNCH_READINESS  55 → 55 (변화 없음)
```

**데이터 소스**:
- P50/P90: Firestore aggregation `system/benchmarks/{profileId}/{categoryId}` (신규 컬렉션, daily-cleanup job에서 동시 업데이트). 초기에는 seed 값(landing=72, saas=68, ecommerce=70)으로 시작.
- 직전 run 비교: T2.5 `compute-run-diff.ts` 재사용. 리포트에 inline 요약, 상세는 `/audits/[id]/diff` 링크.

**구현 위치**:
- `packages/shared-types/src/benchmarks.ts` (신규) — BenchmarkSnapshotSchema
- `packages/audit-core/src/render-comparison.ts` (신규)
- `apps/web/lib/audit-runs/get-prev-run.ts` (신규) — 동일 repoUrl 직전 COMPLETED run 조회

#### §3.2.5 신뢰도 시그널 (Confidence + Evidence 수)

**현재**: confidence chip(T1.5)이 finding 단위에만 존재, 리포트 전체 신뢰도 미표시.
**개선**:
```
[리포트 신뢰도 메타]
- Total findings: 47
  ├─ HIGH:   28 (60%)  ✅
  ├─ MEDIUM: 12 (25%)  ⚠️ 검토 권장
  └─ LOW:     7 (15%)  ❓ false positive 가능

- Evidence per finding (median): 3.2
- 도구 실행 상태: semgrep ✅, osv ✅, lighthouse ✅, axe ✅, secret-scan ✅
- LOW confidence 비중 30% 초과? NO

→ 이 리포트는 신뢰할 수 있습니다.
  (LOW 비중 ≥30% 또는 도구 fail ≥1 시 BYOK LLM 재검증 권장 배너 표시)
```

**구현 위치**:
- `packages/audit-core/src/render-confidence-meta.ts` (신규)
- Finding 표에 evidence count 컬럼 추가 (`finding.evidence.length`)
- `apps/web/components/findings/confidence-disclaimer-banner.tsx` (신규)

### §3.3 5개 항목 통합 와이어프레임 (리포트 전체 구조)

```
┌──────────────────────────────────────────────────────────┐
│  [§3.2.1] SHIP VERDICT 헤더                              │
│  Verdict | Score | Confidence | Top 3 Blockers           │
├──────────────────────────────────────────────────────────┤
│  [§3.2.2] 한 눈에 보는 진단 (1단락 스토리)               │
├──────────────────────────────────────────────────────────┤
│  [§3.2.4] 비교 기준점                                    │
│  P50/P90 표 + 직전 run 변화 표                           │
├──────────────────────────────────────────────────────────┤
│  [§3.2.5] 신뢰도 메타                                    │
│  HIGH/MEDIUM/LOW 분포 + 도구 실행 상태 + 권고            │
├──────────────────────────────────────────────────────────┤
│  §1 카테고리 점수 표 (기존)                              │
├──────────────────────────────────────────────────────────┤
│  §2 PRD Coverage Matrix (USP-2 신규)                     │
├──────────────────────────────────────────────────────────┤
│  §3~§N 카테고리별 finding 표 (§3.2.3 action hint 적용)  │
├──────────────────────────────────────────────────────────┤
│  §N+1 W1-A measuredBy 표 (기존)                          │
│  §N+2 W1-B fine pattern 표 (기존)                        │
└──────────────────────────────────────────────────────────┘
```

---

## §4. 잔여 기능 회수 Todo 리스트 (런치 게이트)

### §4.1 P0 (런치 차단 — 반드시 완료)

| # | 항목 | 출처 | 작업량 | 의존 | 담당 후보 |
|---|---|---|---|---|---|
| L-P0-1 | T1.4 SEVERITY_LANGUAGE_KO finding-card 통합 | ROADMAP Phase 1 | M (2d) | i18n 모듈 (완료) | frontend-developer |
| L-P0-2 | T1.6 #96 Cloud Run min-instances=1 prod 분리 | ROADMAP Phase 1 | S (0.5d) | Terraform | devops-engineer |
| L-P0-3 | Ship Verdict 1줄 결론 generator (§3.2.1) | §3 신규 | S (1d) | 없음 | backend-developer |
| L-P0-4 | Blocker Spotlight Top-3 (§3.2.1) | §3 신규 | S (0.5d) | L-P0-3 | backend-developer |
| L-P0-5 | PRD Coverage Matrix 리포트 섹션 (USP-2) | §2 신규 | M (2d) | W2-A (완료) | backend-developer |
| L-P0-6 | Action hint 사전 + finding 표 컬럼 추가 (§3.2.3) | §3 신규 | M (2d) | shared-types schema 변경 | typescript-pro |
| L-P0-7 | Vibe-Coded profile 추가 (USP-1, 4번째 profile) | §2 신규 | S (1d) | T2.4 (완료) | backend-developer |

**P0 총량: ~9일** (병렬 시 ~4d)

### §4.2 P1 (런치 권장 — 가능하면 완료)

| # | 항목 | 출처 | 작업량 | 의존 |
|---|---|---|---|---|
| L-P1-1 | T2.10 감사 히스토리 대시보드 | ROADMAP Phase 2 | S (2d) | T2.5 (완료) |
| L-P1-2 | T2.14 feature-graph adapter 테스트 | ROADMAP Phase 2 | S (1d) | T2.11 (완료) |
| L-P1-3 | Narrative Summary generator (§3.2.2) | §3 신규 | M (2d) | L-P0-3 |
| L-P1-4 | 비교 기준점: 직전 run diff 인라인 (§3.2.4) | §3 신규 | S (1d) | T2.5 |
| L-P1-5 | Confidence 메타 + disclaimer 배너 (§3.2.5) | §3 신규 | S (1d) | T1.5 (완료) |
| L-P1-6 | Confidence disclaimer 배너 UI | §2 USP-3 | XS (0.5d) | L-P1-5 |
| L-P1-7 | 랜딩페이지 "Vibe-Coded? Audit it." 카피 + 히어로 | §2 USP-1 | S (1d) | 없음 |

**P1 총량: ~8.5일** (병렬 시 ~3d)

### §4.3 P2 (런치 후 또는 여유 시)

| # | 항목 | 출처 | 작업량 |
|---|---|---|---|
| L-P2-1 | 비교 기준점: P50/P90 seed + Firestore aggregation | §3.2.4 | M (2d) |
| L-P2-2 | Ghost Button heuristic 분리 구현 (T3.8 일부) | §2 USP-1 | M (2d) |
| L-P2-3 | #45 d1-prd-schema exactOptionalPropertyTypes 정리 | ROADMAP T2.15 | M (2d) |

### §4.4 Phase 3 LLM BYOK — 런치 필수 여부 판단

**결론: 런치 필수 아님 (Phase 3 전체를 Post-Launch로 분리)**

**근거**:
1. **No-LLM baseline 충분**: 12 카테고리 × 20 step 전부 No-LLM으로 동작. Sprint 2 완료된 W1-A measuredBy + W1-B 80 ID + ANALYZE_PRD 키워드 매칭으로 핵심 진단 가능.
2. **보안 위험 매우 큼**: T3.1 BYOK 인프라(KMS + redactor + zeroization)는 L (2주) 작업. 누설 사고 = 즉시 brand kill.
3. **사용자 BYOK 키 요구는 onboarding friction 증가**: 익명 인증 + 즉시 시작이 ClearToShip의 강점인데 BYOK는 이 강점을 깬다.
4. **USP-2 PRD-aware는 No-LLM(W2-A 완료)으로 이미 차별화 달성**: T3.3 LLM PRD 매칭은 nice-to-have.

**예외 (Pre-Launch에 작은 LLM 작업 1건만 권장)**:
- T3.2 Prompt injection 가드 (P1, 2d) — **나중에 LLM 도입 시 보안 기반**으로 미리 설계. 코드 변경 거의 없는 design ADR + utility skeleton만.

### §4.5 Backlog FUTURE 19건 중 런치 전 포함 후보

| ID | 항목 | 런치 전 포함 여부 | 사유 |
|---|---|---|---|
| B-02-G | 다국어 (EN/JA) | ❌ 제외 | en.ts scaffold만 존재, 라우트 동적 스위치 미구현. Korean baseline 안정화가 먼저 |
| B-03-F | 다크모드 토글 | ❌ 제외 | next-themes 도입 필요, 런치 직후 fast-follow |
| B-03-H | 재감사 CTA | ✅ **포함 권장** (P1) | T2.5 diff route 완료 후 자연스러운 ux. 작업량 XS (0.5d) |
| 나머지 16건 | — | ❌ 제외 | 외부 사용자/MAU 게이트 |

---

## §5. 런치까지 마스터 플랜 (Sprint 단위)

### §5.1 Sprint 3 — "Launch Differentiator" (2026-05-19 ~ 2026-05-30, ~2주)

**목표**: USP 3가지를 코드에 박는다. 인사이트 전달 강화 P0 5개 완료.

**산출물**:
- L-P0-3 ~ L-P0-7 (Ship Verdict, Blocker Spotlight, PRD Coverage Matrix, Action Hint, Vibe-Coded profile)
- 신규 리포트 구조 (§3.3 와이어프레임 그대로)
- 변경된 shared-types schema (Finding.actionHint, Run.shipVerdict)
- 신규 tests ≥30건, 기존 1469 PASS 유지

**수락 기준 (Sprint 3 DoD)**:
- 리포트 최상단에 Verdict + 1줄 결론 표시 (8개 다양한 repo 샘플로 검증)
- P0 finding 0건인 repo는 `READY` 또는 `READY_WITH_CAVEATS` 출력
- PRD 업로드한 run에서 Coverage Matrix 자동 생성
- Vibe-Coded profile 선택 시 emphasizedCategories 가중 적용 확인
- 모든 finding 표에 actionHint 컬럼 존재

### §5.2 Sprint 4 — "Insight Polish" (2026-05-31 ~ 2026-06-09, ~10일)

**목표**: 인사이트 전달 강화 P1 + 잔여 Phase 1/2 회수.

**산출물**:
- L-P0-1 (T1.4 finding-card 통합), L-P0-2 (T1.6 min-instances)
- L-P1-1 ~ L-P1-7 (히스토리 대시보드, feature-graph 테스트, Narrative, 직전 run diff 인라인, Confidence 메타/배너, 랜딩 카피)
- B-03-H 재감사 CTA
- E2E 골든패스 8 카테고리 시나리오 추가

**수락 기준**:
- T1.4, T1.6 ROADMAP DONE 처리
- 리포트가 1단락 narrative + 직전 run 변화 + confidence 메타 전부 포함
- 감사 히스토리 대시보드에서 동일 repo 5개 run trend line 표시

### §5.3 Pre-Launch Hardening (2026-06-10 ~ 2026-06-14, ~5일)

**목표**: 검증 + 관측성 + 위험 차단.

**작업**:
- E2E full suite 3회 반복 (--repeat-each=3) flake 0 확인
- Lighthouse profile 4종 (mobile-slow4G/mobile-fast4G/desktop-cable/desktop-no-throttle) 골든패스 확인
- T2.13 관측성 메트릭 alerting 룰 추가 (P95 latency, error rate, daily quota 도달률)
- Sprint 2 deferred 1건(#45) 처리 시도 (M, 2d) — 실패 시 post-launch
- README 갱신: "Sprint 0 Mock Worker" 흔적 0건 (T0.1 후속 검증)
- DATA POLICY 재선언 + privacy disclaimer (BYOK 미사용 명시)
- 도메인/SSL/Firebase Hosting 라우팅 점검
- 비용 시뮬레이션: DAILY_AUDIT_LIMIT=1000 기준 Cloud Run + Functions + Firestore 예상 월 비용 산출

**수락 기준**:
- 1469 tests + 신규 ≥30 PASS, tsc 0 error, E2E 0 flake
- Alerting 룰 4종 활성
- README/CHANGELOG/PRIVACY 최신화

### §5.4 위험 요소 및 대응 전략

| 위험 | 확률 | 영향 | 대응 |
|---|---|---|---|
| Sprint 3 §3 5개 항목 + USP 3개 일정 초과 | 中 | 高 | Narrative(§3.2.2)와 비교 기준점(§3.2.4)을 P1으로 강등 + L-P0-3/4/5/6/7만 사수 |
| Phase 3 LLM BYOK 미구현이 marketing 약점이 됨 | 中 | 中 | "No-LLM, 즉시 시작, 코드 외부 송신 0" 을 강점으로 카피 전환. PRIVACY 페이지에 강조 |
| i18n EN 미통합 (T1.4 + B-02-G) | 高 | 低 | Korean baseline으로 출시 → 외부 사용자 확보 후 EN 활성 |
| #45 exactOptionalPropertyTypes 정합성 깨짐 | 中 | 中 | post-launch fast-follow. CI에 isolated tsc strict job만 추가, 기존 빌드는 그대로 |
| Cloud Run cold start 사용자 이탈 | 中 | 高 | L-P0-2 min-instances=1 prod 분리 + cold-start-skeleton.tsx 노출 + ETA 표시 (이미 완료) |
| 신규 schema 변경 (Finding.actionHint, Run.shipVerdict) 가 worker/web 동기화 깨짐 | 中 | 高 | **feedback_full_test_run.md 준수** — shared-types + audit-core + audit-worker 3종 동시 test run |
| PRD Coverage Matrix가 W1-A measuredBy 정확도에 종속 | 中 | 中 | 운영 중 P50/P90 누적 시 false positive 비율 모니터링, T2.6 FP 피드백 루프 활용 |
| 비교 기준점 P50/P90 seed 정확도 | 中 | 低 | 초기 6주는 seed 값 사용 + "베타 데이터" 라벨 |

### §5.5 의존성 그래프 (Critical Path)

```
L-P0-3 (Ship Verdict generator)
  └── L-P0-4 (Blocker Spotlight)
        └── L-P1-3 (Narrative Summary)
              └── L-P1-4 (직전 run diff 인라인)
                    └── L-P1-5 (Confidence 메타)
                          └── L-P1-6 (disclaimer 배너)

L-P0-5 (PRD Coverage Matrix) ─── 독립 ── Sprint 3 후반
L-P0-6 (Action Hint) ─── shared-types schema 변경 ── 최우선
L-P0-7 (Vibe-Coded profile) ─── 독립

L-P0-1 (T1.4) ─── L-P0-6 후 권장 (둘 다 finding-card 영역)
L-P0-2 (T1.6) ─── infra 독립, 언제든 가능
L-P1-1 (T2.10) ─── T2.5 완료, 언제든 가능
L-P1-2 (T2.14) ─── 독립

Critical Path: L-P0-6 → L-P0-3 → L-P0-4 → L-P1-3 → L-P1-4 → L-P1-5
            (shared-types schema → verdict → spotlight → narrative → comparison → confidence)
```

**병렬화 가능**: L-P0-2, L-P0-5, L-P0-7, L-P1-1, L-P1-2, L-P1-7 (6 step)

---

## §6. 수락 기준 (Definition of Done for Launch)

### §6.1 기능 측면

- [ ] **F1**: 12 categories × 3 profiles (landing/saas/ecommerce) + 1 신규(vibe-coded) 전부 통과 — 각 profile에서 골든패스 repo 1개 이상 `READY` 또는 `READY_WITH_CAVEATS` 출력
- [ ] **F2**: 20-step pipeline 전 step에서 progress 0~100 정상 갱신, 어느 step에서도 INDETERMINATE 0건
- [ ] **F3**: PRD 업로드 (W2-A) + Coverage Matrix 생성 — PRD 8 claim 샘플 중 매칭률 표시
- [ ] **F4**: Ship Verdict 4단계 (READY/READY_WITH_CAVEATS/NEEDS_WORK/BLOCKED) 분기 모두 회귀 테스트로 검증
- [ ] **F5**: T1.4, T1.6 ROADMAP DONE 처리 + ROADMAP 변경 이력 갱신
- [ ] **F6**: Vibe-Coded profile selected 시 emphasizedCategories(FUNCTIONAL_FLOW, UX_UI, LAUNCH_READINESS) 가중 적용 확인

### §6.2 UX 측면

- [ ] **U1**: §3.2.1 One-shot conclusion — 모든 리포트 최상단에 Verdict + Score + Top 3 Blocker 표시
- [ ] **U2**: §3.2.2 Narrative summary — BUSINESS→UX→PERF→SEC 흐름 1단락 자동 생성
- [ ] **U3**: §3.2.3 Action hint — 모든 finding에 etaMinutes + actionHint.text 표시
- [ ] **U4**: §3.2.4 비교 기준점 — P50/P90 seed 값 표시 + 직전 run 있으면 변화량 표시
- [ ] **U5**: §3.2.5 Confidence 메타 — HIGH/MEDIUM/LOW 분포 + 도구 실행 상태 + disclaimer 배너 조건부 표시
- [ ] **U6**: 모바일 viewport 360px / 414px에서 Verdict 헤더 가독성 확인 (T2.11 후속)

### §6.3 품질 측면

- [ ] **Q1**: 테스트 커버리지 80%+ — shared-types/audit-core/audit-worker/apps/web 4 패키지 모두
- [ ] **Q2**: 1469 PASS + 신규 ≥30 PASS (총 ≥1499)
- [ ] **Q3**: E2E 골든패스 8 시나리오 PASS (--repeat-each=3, flake 0)
- [ ] **Q4**: tsc 0 error 전 패키지 + ESLint 0 error 변경 파일
- [ ] **Q5**: shared-types schema 변경 시 audit-core + audit-worker + apps/web 전부 재실행 (feedback_full_test_run.md 준수)
- [ ] **Q6**: P95 latency < 2s for /api/audit-runs POST, < 5s for status polling

### §6.4 차별화 측면 (USP가 UI/리포트에 명시적으로 노출)

- [ ] **D1 (USP-1 Vibe-Coded)**: 랜딩페이지 히어로에 "Vibe-Coded? Audit it before you ship" 카피 + Vibe-Coded profile 선택지 노출
- [ ] **D2 (USP-2 PRD-aware)**: PRD 업로드 UI(W2-A) + 리포트 §2 Coverage Matrix + recommended_feature 노드가 feature-graph에 표시
- [ ] **D3 (USP-3 Ship-Readiness 단일 점수 + 1줄 결론)**: 모든 리포트 헤더에 Ship Verdict + 1줄 사유 + Top 3 Blocker + Confidence 표시

### §6.5 운영 측면

- [ ] **O1**: Cloud Run min-instances=1 (prod) 적용 (L-P0-2)
- [ ] **O2**: T2.13 관측성 메트릭 alerting 4종 활성 (P95 latency, error rate, daily quota 도달률, cold-start frequency)
- [ ] **O3**: README "Sprint 0 Mock Worker" 흔적 0건 + 환경변수 목록 최신
- [ ] **O4**: PRIVACY 페이지에 "No-LLM, 코드 외부 송신 0" 명시
- [ ] **O5**: 비용 시뮬레이션 결과 docs/COST_ESTIMATE.md 1쪽 추가

---

## §7. 변경 이력 (이 문서)

| 날짜 | 변경 | 작성자 |
|---|---|---|
| 2026-05-18 | 최초 작성 (런치 마무리 마스터 설계, USP 3 + 인사이트 강화 5 + 런치 DoD 통합) | planner (Opus 4.7) |

---

## §8. 참고 산출물 (관련 절대 경로)

- `cleartoship/docs/ROADMAP.md`
- `cleartoship/docs/PRD/w2a-prd-upload.md`
- `cleartoship/docs/PRD/sprint3-wrap-ap-20260517-014225.md`
- `cleartoship/README.md`
- `cleartoship/packages/shared-types/src/enums.ts`
- `cleartoship/packages/shared-types/src/audit-steps.ts`
