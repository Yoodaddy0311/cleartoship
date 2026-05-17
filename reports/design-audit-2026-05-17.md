# DESIGN-AUDIT — ClearToShip 감사 파이프라인 6관점 점검

작성: 2026-05-17 (mvp-planner)
대상: 사용자(vibe-coder)가 자기 프로젝트의 출시 준비도를 판단하도록 돕는 ClearToShip 자체의 감사 설계.
근거: `packages/shared-types/src/enums.ts`, `packages/audit-core/src/scoring/{calculate-scores.ts,checklist-mapping.ts}`, `workers/audit-worker/src/pipeline/steps/01-15`, `packages/audit-core/src/{report,improvement-prd}`, `apps/web/components/dashboard/*`.

---

## ⭐ Top-5 우선 권고 (Now / Next / Later)

| # | 시점 | 권고 | 왜 지금인가 | 비용 |
|---|---|---|---|---|
| 1 | **Now** (데모 전) | **R4 — 측정 안 된 8개 카테고리 자동 N/A 처리** (SCORE-1B-a 변경1) | 현재 11개 중 8개가 항상 100점 → 가짜 안심감. 데모에서 "BACKEND_API 100점인데 측정 안 됨" 들키면 신뢰 붕괴. | S (반나절) |
| 2 | **Now** (데모 전) | **R15 — toolsAvailableRatio를 confidenceMultiplier에 반영** (SCORE-1B-a 변경3) | semgrep/osv/lighthouse 모두 SKIPPED인 상태에서도 COMPLETED 표시. INDETERMINATE 강제 트리거 필요. | S (반나절) |
| 3 | **Next** (데모 직후) | **R8/R9 — N/A 카테고리 흐리게 + 점수 카드 옆 "차단 1줄/행동 1개"** | UI가 가짜 100점을 빛나게 그리는 한 점수 모델 수정만으론 부족. | M (UI-2 task #33과 합치면 1.5일) |
| 4 | **Next** (데모 직후) | **R11/R12 — step05 결과 + prdText를 FEATURE_GRAPH·REQUIREMENT_COVERAGE finding으로 변환** | 가장 큰 미측정 영역. 시그널이 이미 있는데 finding으로 안 흐름. | M (스텝당 0.5~1일) |
| 5 | **Later** (다음 분기) | **R5 — OPERATIONS 카테고리 신설 + Dockerfile/CI/healthz 정적 검사** | 출시 준비도의 큰 빈 영역. 데모 후 사용자 인터뷰로 우선순위 재확인 권고. | L (신규 step+UI+점수 가중치 재배분, 3~5일) |

> **30초 행동 가이드**: 데모 전 #1+#2만 막아도 점수 신뢰도 가장 큰 결함이 사라짐. 1일 작업, 기존 SCORE-1 코드 위에 incremental.

---

## [1] 비즈니스 관점 — 누구의 어떤 의사결정을 돕는가

### (a) 현 상태
- PRD(01_product_audit_platform_prd.md)는 `vibe-coder가 출시 직전 "지금 보여줘도 부끄럽지 않은가?" 자가 판단`을 돕는다고 선언.
- 실제 산출물: `readinessScore(0-100)` + `launchStatus(READY/CONDITIONAL/NEEDS_WORK/AT_RISK/NOT_READY/INDETERMINATE)` + one-line summary + Top5 + Improvement PRD.
- `composeOneLineSummary`(13-generate-report.ts:74-85)가 85+/P0>0/그 외 3가지 분기로 의사결정 문구를 만듦.

### (b) 갭/문제
- "출시 준비도"는 본질적으로 **상대값**(시장/경쟁사/사용자 기대치 대비)인데 점수는 **절대값**으로 산정. 70점이 "내 시장에서 출시 가능"인지 불분명.
- 의사결정 갈래가 점수 한 차원에만 의존 — 결제·법적·운영 리스크처럼 점수가 90이어도 단 1건이면 출시 차단되는 항목이 카테고리 가중치로 희석됨.
- "이 프로젝트의 사용자가 누구인가"(B2B SaaS/개인 학습용/이커머스) 같은 컨텍스트 입력 없음 → 동일 결과를 모두에게 동일하게 해석.

### (c) 권고
- **H**: launchStatus를 점수 + 출시 차단 카테고리(예: 결제/법적/배포 자체 차단성) 분리 평가로 재정의. "Score는 70이지만 출시 차단 1건 있음" 같은 다축 판단 노출.
- **H**: 사용자 컨텍스트(프로젝트 유형) 1개 질문을 `/audits/new`에 추가 → score 해석 문구 분기.
- **M**: One-line summary에 "다음 행동 1개" 추가(현재는 점수만 알려줌).

---

## [2] 기능 관점 — 11 카테고리가 출시 준비도를 측정하는가

### (a) 현 상태
| 카테고리 | weight | 실제 findings 진입 여부 |
|---|---:|---|
| PRODUCT_INTENT | 0 | **없음** (SCORE-1에서 zero-node일 때 N/A 처리) |
| REQUIREMENT_COVERAGE | 0 | **없음** |
| FEATURE_GRAPH | 10 | **없음** (graph만 생성, finding 없음) |
| FUNCTIONAL_FLOW | 10 | **없음** |
| UX_UI | 15 | axe(09단계) |
| FRONTEND_CODE | 10 | **없음** |
| BACKEND_API | 15 | **없음** |
| DATA_MODEL | 10 | **없음** |
| SECURITY_PRIVACY | 15 | semgrep(06) + osv(07) + secret(08) |
| LAUNCH_READINESS | 10 | clone-fail(03) + lighthouse(09) |
| MAINTAINABILITY_DOCUMENTATION | 5 | **없음** |

(`Grep category:` 결과 — 실제로 finding을 생성하는 카테고리는 11개 중 **3개 뿐**.)

### (b) 갭/문제
- **결정적**: 11 카테고리 중 8개는 항상 100점 (감점 없음). 사용자가 보는 "BACKEND_API 100점"은 측정 결과가 아니라 측정이 안 된 상태.
- 누락된 출시 차원:
  - **운영/관측**: 모니터링·로깅·알람·롤백 절차
  - **결제/가격**: pricing page 존재 여부, 결제 플로우 finding
  - **법적**: ToS/Privacy policy, GDPR/PIPA 적용, 데이터 보존 정책
  - **백업/복구**: 데이터 백업 자동화, DR plan
  - **온보딩**: 첫 사용자 가입→가치 도달 시간
- MAINTAINABILITY는 weight 5만 잡혀있고 README/CHANGELOG/test coverage 같은 신호 매핑 0건.

### (c) 권고
- **H**: 측정 신호가 없는 카테고리는 점수 산정에서 제외하거나 N/A 표기(현재 PRODUCT_INTENT/REQ_COV만 N/A). 8개 추가 N/A 필요 또는 측정 신호 추가.
- **H**: `OPERATIONS` (모니터링/롤백/배포 안정성) 카테고리 신설 + Dockerfile/CI/healthz 존재 등 정적 신호 매핑.
- **M**: `BUSINESS_READINESS` (pricing/legal/onboarding) 카테고리 신설 — 사이트맵/Lighthouse SEO findings/페이지명 휴리스틱으로 부분 검출 가능.
- **L**: MAINTAINABILITY에 `README/CHANGELOG/LICENSE 부재` 휴리스틱 + ripgrep으로 test 파일 ratio 측정 → finding 생성.

---

## [3] 디자인 관점 — 정보 위계가 의사결정에 맞는가

### (a) 현 상태
- 대시보드 위계: ScoreRing(중앙) → LaunchStatusChip → executiveSummary → SeverityCounts → CategoryGrid → Top5 → 탭(Graph/Findings/Report/PRD).
- 점수 카드(score-overview.tsx)는 점수+상태+요약만 표시. "다음 행동"·"비교 기준" 없음.

### (b) 갭/문제
- 사용자의 의사결정 흐름은 ① 출시해도 되나? ② 안 되면 가장 먼저 무엇? ③ 그래서 얼마나 걸리나? — 그런데 화면은 ①에 80% 면적을 쓰고 ②③은 한참 아래.
- CategoryGrid는 11개 카드가 동일 비중으로 그리드 — 8개가 가짜 100점인 상황에서 사용자에게 잘못된 안심감을 줌.
- INDETERMINATE 상태(SCORE-1)는 코드엔 있으나 UI 시그니파이어 미실증(UI-2 task #33 pending).
- Top5는 dashboard에 있지만 Improvement PRD의 epic 묶음과 정렬 불일치 가능 — Top5는 severity-only, PRD는 category-bucket.

### (c) 권고
- **H**: 점수 카드 옆에 "출시 차단 1줄" + "다음 행동 1개" 영구 노출(현재 executiveSummary 안에 묻혀있음).
- **H**: CategoryGrid에서 N/A 카테고리는 시각적으로 흐리게(opacity↓) + "측정 신호 부족" 툴팁 — 가짜 100점 인상 제거.
- **M**: Top5 ↔ Improvement PRD epic 연결 — Top5 카드 클릭 시 해당 epic으로 deep-link.
- **L**: ScoreRing 색상에 시장 분포 비교(예: "내 유형 평균 65") 후속 데이터 누적 후 추가.

---

## [4] 코드 관점 — 15-step이 카테고리를 균등 커버하는가

### (a) 현 상태
- 코드 분석 step: 03 clone / 04 structure / 05 features / 06 semgrep / 07 osv / 08 secret / 09 deploy
- 산출 카테고리: 03=LAUNCH_READINESS, 06/07/08=SECURITY_PRIVACY, 09=UX_UI+LAUNCH_READINESS.
- `detect-features`(05)는 page/api/component/auth/external 노드를 만들지만 **finding은 0건** — Feature Graph 시각화에만 쓰이고 점수에는 미반영.

### (b) 갭/문제
- semgrep/osv/secret 모두 SECURITY_PRIVACY로 묶여 동일 카테고리 finding 폭증 → 가중치 15에 묶여 비대.
- PRODUCT_INTENT는 PRD 텍스트(`prdText`) 입력을 받지만 분석 step 없음 — 가설 검증 불가.
- REQUIREMENT_COVERAGE는 detected features ↔ PRD 텍스트 매칭이 가능한 데이터인데 mapping step 없음.
- 11-map-checklist는 이름과 달리 **checklist mapping 안 함** — pendingFindings를 Firestore에 쓰기만 함(코멘트 "Sprint 1+ will additionally re-tag" 명시).

### (c) 권고
- **H**: step05 결과를 FEATURE_GRAPH/FUNCTIONAL_FLOW 카테고리 finding으로도 변환 — "page 있는데 API 없음" = `missing_connection` finding.
- **H**: prdText 존재 시 step에서 "PRD 키워드 ↔ detected features" 매칭 → REQUIREMENT_COVERAGE finding.
- **H**: step04(structure)에서 BACKEND_API/DATA_MODEL/FRONTEND_CODE 카테고리 휴리스틱 finding(예: API route인데 input validation 라이브러리 미사용).
- **M**: step11을 진짜 checklist mapper로 재구현 — `03_audit_checklist_scoring_rubric.md` 90+ 항목 체크리스트를 finding↔체크리스트 ID로 묶어 evidence-backed score 산정.
- **L**: semgrep finding 200개 캡(현재 slice(0,200))을 카테고리 분산 후 재고.

---

## [5] 구조 관점 — 파이프라인 의존성

### (a) 현 상태
- 순서: validate → fetchMeta → clone → structure → detectFeatures → semgrep → osv → secret → deployUrl → graph → mapChecklist → calculateScores → report → prd → cleanup.
- `PipelineState`로 중간 산출물(fileTree/techStack/detectedFeatures/pendingFindings/severityCounts) 공유.
- 부분 실패: runner.ts는 첫 step 에러 시 markRunFailed로 전체 FAILED — 도구 미설치는 step 내부 graceful skip으로 통과.

### (b) 갭/문제
- **재사용 불가**: cleanup(15)이 tmp 디렉토리 삭제 — 재분석 시 clone 다시 수행. 동일 commit 재분석 시 캐시 hit 메커니즘 없음.
- **부분 실패 신뢰 경계 불명**: semgrep SKIPPED + osv SKIPPED + axe SKIPPED여도 status=COMPLETED로 표시. 사용자는 "분석 끝"으로 인식하나 신호 0개로 점수 산정. SCORE-1의 coverageRatio가 이를 일부 처리하나 도구 SKIPPED 비율은 신호에 미반영(featureNodeCount만 봄).
- step12→13 데이터 전달이 `(state as unknown as { __categoryScores })` 캐스트 — 타입 안전성 누수.
- 재분석 시 diff(이전 audit 대비 새 finding/해소된 finding) 없음.

### (c) 권고
- **H**: tools-health 상태를 PipelineState에 누적 → ToolResult.SKIPPED 개수가 임계치 초과 시 launchStatus=INDETERMINATE로 강제(현재 featureNodeCount만 기준).
- **H**: `__categoryScores` 캐스트 제거 — PipelineState에 정식 필드로 승격.
- **M**: 동일 (repoUrl, commitHash) 재분석 시 step03~09 결과 Firestore 캐시 hit(`auditRuns/{prevId}/cache`). 사용자가 "다시 분석"을 눌렀을 때 30초 내 응답 가능.
- **M**: previousRunId 입력 → diff section을 Report에 추가("신규 P0 2건, 해소 P1 3건").
- **L**: pipeline DAG화(현재 선형 array) — semgrep/osv/secret을 병렬 실행해 wall-time 단축.

---

## [6] 보완 관점 — 6관점 통과 후 남는 빈틈

### (a) 현 상태
- 1회 측정 → 1회 점수 → 1회 PRD. 사용자 피드백 루프 0.
- finding status는 OPEN/ACK/RESOLVED/FALSE_POSITIVE enum만 있고 실제 transition UI/API 미실증.

### (b) 갭/문제
- **피드백 루프 없음**: 사용자가 "이 finding은 false positive"라고 표시해도 다음 분석에 반영 안 됨. 점수 신뢰도 누적 학습 0.
- **재분석 diff 없음**: 어떤 finding을 해결했는지 사용자가 직접 비교해야 함.
- **정성 평가 부재**: 점수는 코드 신호 합이지 "사용자 가치"는 미측정. PRD 텍스트 입력은 있으나 NLP 분석 없음.
- **외부 컨텍스트 부재**: 경쟁사 / 시장 / 이용자 페르소나 / 매출 모델 입력 0.
- **공유/협업 부재**: audit report 외부 공유 링크, 팀원 코멘트, 우선순위 재배치 UI 0.

### (c) 권고
- **H**: finding action(`mark as false positive` / `acknowledge`) UI + 재분석 시 마스킹.
- **M**: 재분석 diff section — Report에 "이전 대비" 표 1개 추가.
- **M**: improvementPRD에 사용자 우선순위 재배치(드래그) → 다음 PRD 생성에 반영.
- **L**: 외부 공유 view-only 링크 (signed URL + 7일 만료) — MVP 후 가치 검증되면.
- **L**: 정성 평가 — PRD 텍스트 ↔ feature 매핑 점수(낮은 LLM 비용으로 가능, 데모 후).

---

## 점수 설계 재정의 제안 — SCORE-1 스펙 갱신안 (SCORE-1B)

### 변경 1: 측정 신호 ↔ 카테고리 분리 명시
- `CategoryMeta`에 `measuredBy: AuditStep[]` 필드 추가.
- 어떤 step도 해당 카테고리를 측정하지 않으면 categoryScores[*].score=null + UI에서 흐리게.
- 현 상태 적용 시 8개 카테고리가 자동 N/A → "가짜 100점" 즉시 제거.

### 변경 2: 출시 차단성 분리 평가
- `launchStatus` 결정에 `blockingFindings: Finding[]` (P0 + 특정 카테고리)을 분리. 
- 점수 ≥ 85여도 blocking 1건이면 `BLOCKED` 라벨 신설.

### 변경 3: 신뢰도(confidence) 점수 노출
- coverageRatio에 `toolsAvailableRatio` 추가 (현재 semgrep/osv/lighthouse SKIPPED 비율 반영).
- readinessScore와 별도로 `confidenceScore(0-100)` 노출. 둘 다 ≥ 70일 때만 READY.

### 변경 4: 사용자 컨텍스트 1차 분기
- `/audits/new`에 `projectType: 'saas-b2b'|'consumer-app'|'internal-tool'|'demo-only'` 1개 필드 추가(이미 prdText 입력칸 있으므로 UX 부담 적음).
- composeOneLineSummary가 타입별 다른 문구 출력.

### 변경 5: 행동 가능성(actionability) 평가
- `readinessScore`와 별도로 `actionable count`(P0+P1 미해결 / 1주 추정 작업량) 노출.
- "오늘 출시 가능?" 외에 "이번 주 안에 출시 가능?" 답변 가능.

### 도입 우선순위
- **즉시(SCORE-1B-a)**: 변경 1 + 변경 3 (기존 SCORE-1 코드 위에 1일).
- **데모 후(SCORE-1B-b)**: 변경 2 + 변경 4 (UI 변경 동반).
- **다음 분기(SCORE-1B-c)**: 변경 5 (피드백 루프와 함께).

### 마이그레이션 영향 (기존 audit run 데이터 호환성)
- **변경 1 (measuredBy + score=null)**: `CategoryScore.score`는 이미 `number | null` 타입. 기존 run은 score=숫자로 저장돼 그대로 표시되고, 신규 run만 null 가능 — 스키마 변경 없음, **호환 OK**.
- **변경 2 (BLOCKED 라벨)**: `LaunchStatus` enum에 `'BLOCKED'` 추가. 기존 run은 기존 6개 값 중 하나로 남고 UI는 unknown fallback 필요 — `shared-types` 버전 minor bump + UI에서 `LAUNCH_STATUS_LABELS_KO`에 항목 추가하면 **호환 OK**.
- **변경 3 (confidenceScore 분리 노출)**: `AuditReport`에 `confidenceScore?: number` 옵셔널 필드. 기존 run에는 undefined → UI에서 "측정 안 됨" 처리 — **호환 OK**.
- **변경 4 (projectType)**: `AuditRun`에 `projectType?: string` 옵셔널. Firestore에 누락된 기존 run은 `'unknown'` fallback → composeOneLineSummary가 default 문구 — **호환 OK**.
- **변경 5 (actionableScore)**: `AuditReport`에 옵셔널 필드 추가. 기존 run에는 미계산 → UI 숨김 — **호환 OK**.
- **결론**: 5개 변경 모두 옵셔널 필드/null 허용 패턴이라 기존 run을 백필(backfill)하지 않아도 됨. 다만 `MARKDOWN`은 `render-markdown.ts`가 신규 필드를 렌더링하므로 기존 run 리포트 재생성 시에만 신규 섹션이 나타남.

---

## 부록: H/M/L 권고 통합 리스트

| ID | 관점 | 권고 | 우선순위 | 비용 |
|---|---|---|---|---|
| R1 | 비즈니스 | launchStatus 다축화 + BLOCKED 라벨 | H | M |
| R2 | 비즈니스 | projectType 입력 + 해석 분기 | H | S |
| R3 | 비즈니스 | one-line에 "다음 행동 1개" 추가 | M | S |
| R4 | 기능 | 측정 안 된 카테고리 자동 N/A | H | S |
| R5 | 기능 | OPERATIONS 카테고리 신설 | H | L |
| R6 | 기능 | BUSINESS_READINESS 카테고리 신설 | M | L |
| R7 | 기능 | MAINTAINABILITY 휴리스틱 (README/test ratio) | L | S |
| R8 | 디자인 | 점수 카드 옆 "차단 1줄 + 행동 1개" 영구 노출 | H | S |
| R9 | 디자인 | N/A 카테고리 시각적 흐리게 + 툴팁 | H | S |
| R10 | 디자인 | Top5 → Epic deep-link | M | S |
| R11 | 코드 | step05 결과 → FEATURE_GRAPH finding 변환 | H | M |
| R12 | 코드 | prdText ↔ features 매칭 step 추가 | H | M |
| R13 | 코드 | step04에서 BACKEND/DATA/FRONTEND 휴리스틱 | H | M |
| R14 | 코드 | step11 진짜 checklist mapper로 재구현 | M | L |
| R15 | 구조 | tools-health → INDETERMINATE 강제 | H | S |
| R16 | 구조 | __categoryScores 캐스트 제거 | H | S |
| R17 | 구조 | 동일 commit 재분석 캐시 | M | M |
| R18 | 구조 | 재분석 diff section | M | M |
| R19 | 구조 | 파이프라인 병렬화 | L | M |
| R20 | 보완 | finding mark-as-false-positive | H | M |
| R21 | 보완 | report에 이전 대비 diff | M | M |
| R22 | 보완 | improvement PRD 우선순위 드래그 | M | M |
| R23 | 보완 | view-only 공유 링크 | L | M |
| R24 | 보완 | 정성 평가 (PRD ↔ feature NLP) | L | L |

> 비용 기준: **S** ≤ 1일, **M** ≤ 3일, **L** > 3일.

**핵심 결론**: 가장 시급한 R4(가짜 100점 제거) + R11~13(8개 카테고리 측정 신호 생성) 없이는 점수가 의사결정에 쓸 수 없는 숫자. SCORE-1B-a를 데모 직전 반드시 도입 권고.
