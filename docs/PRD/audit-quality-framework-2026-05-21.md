# PRD — Audit Quality Framework

**작성일**: 2026-05-21
**저자**: team-audit-quality (leader + checklist-architect + quality-reviewer + ux-designer + plugin-architect + confidence-typer)
**상태**: DRAFT — 다음 세션이 구현 시작 전 검토 + 합의
**의존**: Phase 0 머지, PR-A1~A4 머지, PR #38 (Phase 1 worker tooling) 대기

---

## 0. Executive Summary

전수검사(2026-05-21) 결과 ClearToShip audit은 **분석 엔진 80% 완성, UI 가시화 40% 미완** 상태로 정리됨. 핵심 문제 3가지:

1. **사용자가 점수 봐도 "다음 30초에 뭘 할지" 못 알아냄** (UX 가시화 미완)
2. **vibe-coding 특화 위험 7-8개 중 우리가 잡는 건 0-2개** (체크리스트 정밀도 부족)
3. **신뢰도 매트릭스 없음** — 점수가 D/F/L 어디서 왔는지, finding의 confidence가 어떤 신호로 산출됐는지 사용자에게 불투명

이 PRD는 5개 영역의 권장사항을 통합 — A) 체크리스트 정교성, B) 검수 퀄리티(FP/FN), C) UX 가시화, D) plug-in 구조, E) 신뢰도 매트릭스. 구현은 별도 PR로 phase별 진행.

**최소 effective ship sequence** (이번 PRD 머지 → 구현):
- **Phase 0 (plug-in foundation)**: D 섹션 — 새 check 추가가 1 file로 끝나는 구조 (~1주, blocking)
- **Phase 1 (high-impact UX)**: C.2 Narrative + C.4 N/A 카테고리별 + 사용자 가시화 우선순위 (~1주)
- **Phase 2 (vibe-coding 특화)**: A.2의 8개 검사를 plug-in으로 추가 (~2주, plug-in 구조 검증)
- **Phase 3 (quality + confidence)**: B.1 confidence 정량화 + E의 ConfidenceChip tooltip 강화 + suppress 메커니즘 (~2주)
- **Phase 4 (C.1 Next 30min)**: 가장 무겁지만 UX 임팩트 최고 (~1주)

---

## A. 체크리스트 정교성 + vibe-coding 특화 위험

> **작성자 안내**: checklist-architect agent 응답이 누락되어 leader가 다른 4명의 결과와 기존 코드(`packages/shared-types/src/enums.ts` AuditCategory, `packages/audit-core/src/scoring/checklist-mapping.ts` CATEGORY_META)를 기반으로 fallback으로 작성. 다음 세션이 본격 구현 전에 재검토 권장.

### A.1 11 카테고리 정밀 재정의

각 카테고리에 대해 (1) 무엇을 검사 (2) 현재 detection + 한계 (3) 정밀화 방안.

| # | 카테고리 | 현재 detection | 한계 | 정밀화 방안 (Phase A→B→L) |
|---|---|---|---|---|
| 1 | **PRODUCT_INTENT** | README 존재만 확인 (`audit-evidence.ts:30` ACTIVE_EVIDENCE_KEYS) | "있다/없다" 이진. 명확성/완결성 평가 X | A: GitHub description + topics (D+F) → B: README 본문 + CLAUDE.md를 LLM이 의도 구조화 → L |
| 2 | **REQUIREMENT_COVERAGE** | PRD 첨부 시만 ANALYZE_PRD step 실행 | PRD 없으면 N/A. 코드와 매칭 X | A: docs/PRD/*.md 파일 발견 (D) → B: LLM이 PRD 헤더 ↔ route/API/test 의미 매칭 → L |
| 3 | **FEATURE_GRAPH** | 파일 트리 + import graph (`feature-heuristics.ts`) | "노드는 있는데 edge가 정합적인가"는 못 봄 | A: RouteInventory (PR-A3 ✅) → B: 순환 import / unreachable node 감지 (D) |
| 4 | **FUNCTIONAL_FLOW** | 없음 (deferred) | 0% | A: 테스트 contract 추출 (vitest/playwright describe/it) → B: E2E user-story 자동 narrative (L) |
| 5 | **UX_UI** | Lighthouse a11y/CLS/LCP | 모바일 360px 회귀 못 봄. 색맹 친화도 X | A: Lighthouse Mobile run + visual baseline (Playwright SSIM) → B: contrast ratio + axe-core full |
| 6 | **FRONTEND_CODE** | semgrep (Phase 1 대기, PR #38) | 현재 0% 감지 — 코드 품질 모름 | A: PR #38 머지 후 semgrep + 별도 vibe-coding plug-in 8개 (A.2 참조) |
| 7 | **BACKEND_API** | 엔드포인트 count만 | "auth 체크 누락?", "CORS 정책?" 모름 | A: handler AST scan으로 auth middleware 체인 확인 + CORS config 추출 (D) |
| 8 | **DATA_MODEL** | Prisma/Firestore parser (PR-A2 ✅) | 관계형 무결성 / N+1 쿼리 못 봄 | A: schema relations graph → B: query callsite scan (n.findMany inside .map?) (D) |
| 9 | **SECURITY_PRIVACY** | semgrep + osv-scanner (Phase 1 대기) | 현재 정적 분석만. 런타임 leak 못 봄 | A: PR #38 머지 후 + Firestore rules 정합성 + JWT verify scan (D) |
| 10 | **LAUNCH_READINESS** | CI config 존재 + LH (deferred 일부) | "deploy URL 죽음" 빼고 별 신호 X | A: GitHub Actions YAML 분석 + 환경변수 누락 감지 (D) |
| 11 | **BUSINESS_READINESS** | weight=0 baseline 유지 | meta-category, weight 0이라 점수 영향 X | C: 이대로 유지. 단 "Pricing/Legal/Onboarding" 페이지 발견 인벤토리는 표시 |

### A.2 vibe-coding 특화 신규 검사 항목 (8개)

각각 plug-in 1개 (D 섹션 구조 따라). 모두 `*.check.ts` 한 파일로 추가 가능.

| # | 위험 | 매핑 카테고리 | Detection (D/F/L) | Plug-in id 제안 | 우선순위 |
|---|---|---|---|---|---|
| **V1** | Hallucinated imports (`from 'react/nonexistent'`) | FRONTEND_CODE | D — tsc resolution 실패 + 패키지 미설치 cross-check | `frontend.hallucinated-imports` | HIGH |
| **V2** | 하드코딩된 API keys / secrets | SECURITY_PRIVACY | D — semgrep secrets ruleset + entropy detection | `security.hardcoded-secrets` | HIGH |
| **V3** | `any` 남용 (`as any`, `: any`) | FRONTEND_CODE | D — AST count, threshold per LOC | `frontend.any-overuse` | MED |
| **V4** | Untested edge cases (error/logout/empty state) | FUNCTIONAL_FLOW | D — vitest describe/it 키워드 매칭 (test contract) | `flow.missing-edge-tests` | MED |
| **V5** | 반응형/모바일 360px 깨짐 | UX_UI | D — Playwright viewport SSIM vs desktop baseline | `ux.mobile-viewport-regression` | HIGH |
| **V6** | 인증 우회 (handler에 authMiddleware 누락) | SECURITY_PRIVACY | D — route AST → handler chain → middleware 명시성 | `security.missing-auth-middleware` | HIGH |
| **V7** | CORS overly permissive (`*` origin) | SECURITY_PRIVACY | D — config file scan (`next.config.js`, middleware.ts) | `security.cors-wildcard` | MED |
| **V8** | N+1 쿼리 (loop 안 ORM call) | DATA_MODEL | D — AST: `array.map(async () => prisma.x.findUnique)` 패턴 | `data-model.n-plus-one` | MED |

**구현 순서 (Phase 2 plug-in batch)**:
1. HIGH 4개 (V1, V2, V5, V6) — 가장 자주 발생 + 임팩트 큼
2. MED 4개 (V3, V4, V7, V8) — 정밀도 향상 단계

V2 / V6 / V7은 PR #38 (semgrep) 머지 후 즉시 가능. V5는 Phase 1 chromium + Playwright visual baseline 필요. V1 / V3 / V4 / V8은 D bucket 순수 AST.

### A.3 우선순위 매트릭스

| 항목 | 사용자 가치 | 구현 비용 | Phase |
|---|---|---|---|
| A.1 카테고리별 detection 정밀화 (11개) | HIGH | 중 (점진적) | Phase 2~3 |
| A.2 V1-V8 plug-in 추가 | HIGH | 낮음 (1 file/plugin) | Phase 2 (D 머지 후 즉시) |
| V1 (hallucinated imports) | HIGH | 낮음 | Phase 2 우선 |
| V2 (hardcoded secrets) | HIGH (보안) | 중 (PR #38 대기) | Phase 2 ⏳ |
| V5 (mobile viewport) | HIGH (실 사용자) | 중 (Playwright baseline) | Phase 2 |
| V6 (auth missing) | HIGH (보안) | 중 (AST 정밀도) | Phase 2 |

---

## B. 검수 퀄리티 (FP / FN, confidence, evidence)

### B.1 Confidence 정량화

현재 `packages/shared-types/src/enums.ts:45`에 HIGH/MEDIUM/LOW 3-tier만. `compute-fcs.ts:33`의 `CONFIDENCE_WEIGHT`가 `{HIGH:3, MEDIUM:2, LOW:1}`로 단순 매핑. 각 analyzer가 confidence를 하드코딩 — `prisma-analyzer.ts`의 R1 `@id` 누락은 `HIGH`, R5 민감 필드는 `MEDIUM`. `risky-functions.ts`는 confidence 필드를 설정조차 안 함.

**설계안**: 내부 numeric score (0.0-1.0) → tier 매핑:

| 범위 | tier | 의미 |
|---|---|---|
| 0.85-1.0 | HIGH | 결정론적 증거 2개+ cross-confirm, AST 완전 매칭 |
| 0.55-0.84 | MEDIUM | 단일 소스 heuristic 또는 regex 단독 매칭 |
| 0.0-0.54 | LOW | LLM 추론만 또는 단서 부족 |

**소스별 가중치**:

| 소스 | 기여 |
|---|---|
| Semgrep rule (HIGH severity) | +0.4 |
| AST 직접 매칭 (prisma-analyzer) | +0.35 |
| regex name heuristic (risky-functions) | +0.25 |
| LLM 단독 | +0.20 |
| cross-tool 동일 위치 confirm | +0.15 (보너스) |
| 테스트 파일 위치 | -0.30 (패널티) |

R1 MISSING_ID(`prisma-analyzer.ts:133`)가 HIGH인 것 + R5 SENSITIVE_FIELD(line 288)의 MEDIUM이 적절 → **이 두 케이스를 numeric score 레퍼런스 구현으로 삼는다.**

### B.2 Evidence Citation 강화

현재 `NormalizedEvidence`는 path/lineStart/lineEnd/snippet/selector/screenshotPath/url/metadata 지원. 활용 부족:
- `prisma-analyzer.ts:103`의 `makeEvidence`는 path+lineRange+snippet만. **단일 라인 evidence가 많음** — `field.line`~`field.line`.

**보강 3가지**:

1. **코드 컨텍스트 라인 확장** — 단일 라인 → 앞뒤 5줄 (`lineStart-5 / lineEnd+5`). 리뷰어가 surrounding context 없이도 판단.

2. **외부 레퍼런스 연결** — `EvidenceSchema.url` 현재 거의 null. 채워야 할 케이스:
   - Semgrep rule → `https://semgrep.dev/r/<rule-id>`
   - 보안 finding → OWASP / CVE link
   - risky-functions의 `auth/payment` → OWASP Auth Cheat Sheet

3. **multi-source cross-check 메타데이터** — `metadata` 필드 활용: `{ confirmedBy: ['semgrep', 'prisma-analyzer'], gitBlameAuthor: 'unknown', commitAge: '90d' }`. UI에 "2개 도구 확인" 배지 표시.

### B.3 False Positive 감소

현재 `risky-functions.ts:113`에 `TEST_PATH_REGEX`로 test 파일 제외. Firestore vs Prisma ORM 분기도 있음. **그러나 suppress 메커니즘 0개.**

**설계 3-tier suppress**:

1. **인라인 suppress 주석** — `// cleartoship-ignore: <rule-id>` 형식. 파서가 `NormalizedFinding.tags`의 rule tag와 매칭 후 `status: SUPPRESSED`로 변환.

2. **`.cleartoshipignore` 파일** — glob 패턴 기반:
```
# dev-only debug routes
apps/web/src/app/api/debug/**
# generated files
apps/web/src/generated/**
```

3. **Repo-level config (`cleartoship.config.json`)** — finding category 단위 suppress 또는 severity downgrade:
```json
{
  "suppressRules": ["R3_ONE_WAY_RELATION"],
  "downgradeSeverity": { "R2_STRING_NO_LENGTH": "P3" }
}
```

**4. 자동 패턴 인식 (단기 win)** — vibe-coding 컨텍스트의 가장 흔한 FP는 "AI 생성 boilerplate의 hardcoded dev credential". 다음 두 패턴은 confidence 자동 LOW:
- path에 `example/`, `sample/`, `demo/`, `fixture/`, `__fixtures__/` 포함
- snippet이 `TODO` 또는 `FIXME` 주석 포함 → 미완성 placeholder

### B.4 False Negative 감소

`audit-evidence.ts:30`의 `ACTIVE_EVIDENCE_KEYS`는 `['README_PRESENT']` 1개만 활성. 4개 DEFERRED. `AuditRun.partialResultTools`(`domain.ts:122`)가 tool skip 추적하지만 UI에서 "어떤 카테고리가 덜 검사됨"을 표면화하지 않음.

**설계안**:

1. **도구 간 cross-check** — 같은 리스크를 다른 각도에서 검증:
   - `semgrep` secret detection ↔ `risky-functions.ts`의 `pii` category와 path 겹침 cross-join
   - `prisma-analyzer` R5 SENSITIVE_FIELD ↔ semgrep의 `detect-object-injection` rule 위치 매칭

2. **"이 audit이 못 잡는 것" 명시 (Coverage Disclaimer)** — `AuditReport.coverageGaps: string[]` 필드 추가. 각 tool이 한계를 선언:
   - prisma-analyzer: "애플리케이션 레이어 암호화 여부는 정적 분석 불가"
   - design/consistency: "Storybook 부재 시 정의된 토큰 없음으로 오판 가능"
   - risky-functions: "TypeScript type narrowing 통한 정교한 auth bypass 감지 불가"

3. **누락 가능성 배지** — `CategoryScore.origin` 옆에 `coverageLevel: 'full'|'partial'|'shallow'` 필드 추가. `shallow`인 카테고리에는 "LLM 도입 후 완전 분석 가능" 문구.

### B.5 사용자 가시화 — 전체 신뢰도 메트릭

**현재 FCS 활용**: `compute-fcs.ts:69`의 uncertainty (`lowConfRatio×20 + indeterminateCats×3`, cap 30)가 numeric. `FCSResult.lower/upper`가 신뢰 구간.

**UI 설계 (기존 컴포넌트 재사용 — E 섹션과 일관)**:

1. **Finding별 confidence badge** — 기존 `confidence-chip.tsx` 유지 + tooltip 강화 ("Semgrep HIGH severity rule + prisma-analyzer AST match → HIGH")
2. **Audit 전체 신뢰도** — Dashboard 상단 "신호 충분/부족" 2단계 텍스트 + FCS uncertainty 30 이하 초록 / 이상 주황
3. **카테고리별 coverage** — ScoreOrigin (D/F/L/mixed) 색상 코딩, E 섹션의 OriginBadge와 통합
4. **"오탐 신고"** — `false-positive-toggle.tsx` (이미 production) UX 보강 (피드백 사유 입력 modal 추가)
5. **Vibe-coding 컨텍스트 경고 배너** — `.cursorrules`/`CLAUDE.md`/`AGENTS.md` 감지 시 "이 프로젝트는 AI 생성 코드 비중이 높아 일부 findings는 의도된 패턴일 수 있음. 오탐 처리 권장." E 섹션의 vibe-coding 배너와 통합.

---

## C. UX 가시화 — 다음 액션

> ux-designer의 핵심 발견: **C.2 Narrative는 거의 무료** (이미 `render-narrative.ts` 완성, 호출만 필요). **C.4 N/A 정확화는 1일 미만**. **C.1 Next 30min은 가장 무겁지만 임팩트 최고**. 구현 순서: **C.2 → C.4 → C.3 → C.5 → C.1**.

### C.1 Next 30min Checklist

- **데이터 source**: top P0/P1 findings 중 `actionHint.etaMinutes ≤ 30` 필터 (ActionHintEtaSchema 5/30/60/240 ladder 강제, `domain.ts:173`)
- **정렬**: `(severityRank, etaMinutes, createdAt)`
- **표시**: 우선순위 카드 3개 + 체크박스 + 예상 시간 + 단계별 가이드
- **상태**: localStorage key `cts:next30:{auditId}:checked` persist
- **배치**: ScoreOverview 바로 아래 hero 위치

i18n keys: `dashboard.next30.title`, `dashboard.next30.empty`, `dashboard.next30.eta.{n}min`, `dashboard.next30.markDone`, `dashboard.next30.reset`

### C.2 Narrative 3-sentence

`packages/audit-core/src/narrative/render-narrative.ts`가 이미 deterministic하게 S1/S2/S3 생성. ko/en 양쪽. **호출/표시만 필요**.

- API: `getReport(runId)` 응답에 `narrative: { s1, s2, s3 }` 필드 추가
- UI: ScoreOverview 내부 별도 블록 (border-l-4)
- 형식: "이 audit이 발견한 것" 1문장 + "가장 큰 위험" 1문장 + "다음 액션" 1문장

### C.3 BLOCKED 상태 설명 + 재시도 가이드

현재 `<code>REPO_TOO_LARGE</code>` raw 노출만 (`page.tsx:138`). 7개 abortReason mapping:

| abortReason | 한국어 label | 사용자 설명 | 재시도 step |
|---|---|---|---|
| REPO_TOO_LARGE | 저장소가 너무 큼 | 200MB 한도 초과 | 작은 sub-directory만 audit하거나 일부 제외 |
| DAILY_QUOTA_EXCEEDED | 일일 할당량 초과 | 무료 plan 한도 | 24시간 후 재시도 또는 paid plan |
| GIT_CLONE_FAILED | 저장소 접근 불가 | private repo 또는 토큰 만료 | public 전환 또는 GitHub 토큰 갱신 |
| DEPLOY_URL_UNREACHABLE | 배포 URL 응답 없음 | https 인증서 또는 DNS 문제 | curl로 직접 확인 후 재시도 |
| WORKER_TIMEOUT | 분석 시간 초과 | 10분 한도 초과 | Phase 1 머지 후 timeout 600→900 적용됨 |
| INVALID_INPUT | 입력 형식 오류 | URL 형식 불일치 | github.com/owner/repo 형식 확인 |
| INTERNAL_ERROR | 내부 오류 | 워커 crash | 5분 후 재시도, 지속 시 보고 |

BlockedBanner 컴포넌트 추출 권장.

### C.4 N/A 카테고리 카드별 사유 정확화

현재 `CategoryNATile`(`category-grid.tsx:254`)이 모든 카테고리에 동일 description. 11개 카테고리별 (reason + howToFix) 매핑:

i18n key convention: `category.na.{KEY}.reason` / `.howToFix`

예시:
- PRODUCT_INTENT: `reason: "PRD 문서가 없거나 GitHub description이 빈 상태"` / `howToFix: "다음 audit에 PRD 첨부 또는 GitHub description 작성"`
- DATA_MODEL: `reason: "Prisma/Firestore/Drizzle schema가 발견되지 않음"` / `howToFix: "DB 사용 시 schema 파일 추가, 안 쓰면 정상"`
- FRONTEND_CODE: `reason: "코드 패턴 검사 도구(semgrep)가 워커에 미설치"` / `howToFix: "Phase 1 PR #38 머지 후 자동 측정"`
- SECURITY_PRIVACY: `reason: "보안 스캐너(semgrep/osv-scanner) 미설치"` / `howToFix: "Phase 1 PR #38 머지 후 자동"`

`CategoryNATile`에 `category` prop 추가.

### C.5 Origin Badge Legend + 신뢰도 통합 패널

현재: 뱃지만 표시, hover tooltip만 학습. 모바일/터치 사용자 대응 부족.

**통합 설계** (B.5 + E 섹션과 일관):
- 단일 collapsible `<details><summary>` 패널 "**이 점수는 어떻게 산출됐나요?**"
- 4종 origin (📦 D / 🌐 F / 🤖 L / ⚙️ mixed) 한 줄씩 + 3단계 신뢰도 설명 (높음/보통/낮음)
- ScoreOverview 또는 CategoryGrid 위에 배치

### C.6 통합 Dashboard 레이아웃

배너 stacking order (상→하):
```
1. PartialResultBanner (도구 미설치)
2. Vibe-coding 컨텍스트 배너 (B.5 / E와 통합)
3. BlockedBanner (BLOCKED 상태일 때만)
4. ScoreOverview
   └─ Narrative 3-sentence (C.2)
5. Next 30min Checklist (C.1)
6. SeverityCounts
7. StrengthsPanel (V3 + inventory cards from PR-A4-fix)
8. Origin Legend (C.5 + B.5 + E 통합)
9. CategoryGrid (with N/A 카테고리별 정확 사유 — C.4)
10. Top 5 findings
```

비-개발자 친화 표현:
- abortReason → "중단 사유"
- guardrail → "자동 차단"
- ETA → "예상 시간"
- 명령조 지양 ("재시도하세요" X → "5분 후 다시 시도해 보세요")
- "결정론(D)" tooltip에 "같은 코드면 항상 같은 점수" 한 줄 보강

---

## D. 확장 가능 Plug-in 구조

> **문제**: 새 검사 1개 추가 시 평균 **5+ 파일** 수정 — pipeline step + 분석기 + state 타입 + i18n + 카테고리 매핑 + UI. vibe-coding 작업자가 "PII 정규식 1개 추가"에 4-6시간 소요 → **1 file = 1 PR** 축소가 목표.

### D.1 AuditCheck Plugin Interface

`packages/audit-core/src/plugins/types.ts` (NEW). finding/evidence 타입은 `adapter.ts`의 `NormalizedFinding`/`NormalizedEvidence`를 그대로 import (SSOT). plugin은 `Pick<NormalizedFinding, 'severity' | 'confidence' | 'evidences'>` 만 반환, runner의 `toNormalizedFinding(check, emitted)` 헬퍼가 metadata 합쳐 정식 finding 생성. category는 `z.enum(AUDIT_CATEGORIES)` 로 강제 (`getCategoryMeta` throw 차단).

```ts
export interface AuditCheck extends z.infer<typeof AuditCheckSchema> {
  applies: AppliesGate;                                     // techStack / framework / filePatterns / predicate
  detect: (ctx: CheckContext) => Promise<DetectorResult>;   // OK | SKIPPED | FAILED
}
```

`CheckContext` 노출 — `clonePath`, `fileTree`, `techStack`, `frameworkProfile`, `dataModelInventory`, `routeInventory`, `readFile` (clonePath boundary 강제, path traversal 방지), `log`. **`node:fs` 직접 import 금지 (review reject).**

### D.2 Registry + Auto-discovery

`CHECK_REGISTRY` (`registry.ts`) — `register(check)` 시 zod validation + duplicate id 차단. Discovery는 **build-time generated barrel** (`scripts/gen-check-barrel.ts`). 파일 명명: `*.check.ts`. PR diff = 1 file + 1 test + generated barrel.

### D.3 Pipeline 통합

신규 step `RUN_CHECK_PLUGINS`를 **`AUDIT_STEPS[14]`** 에 삽입 (`ANALYZE_BUSINESS_READINESS` 직후, `GENERATE_FEATURE_GRAPH` 직전). `AUDIT_STEP_LABELS_KO`에 한국어 라벨 동시 추가 (`labels-ko-completeness.test.ts` invariant 만족).

```
... ANALYZE_BUSINESS_READINESS (13)
    → RUN_CHECK_PLUGINS (14, NEW)
    → GENERATE_FEATURE_GRAPH (15, was 14)
    → MAP_CHECKLIST → CALCULATE_SCORES → ...
```

`step19-run-check-plugins.ts` — `pMap(concurrency: 4)` parallel 실행, per-plugin `budget.timeoutMs` (default 30s), try/catch error isolation (1개 crash가 19개 다른 plugin 멈추지 않음).

**Scoring 자동 합류**: `getCategoryMeta`가 `CHECK_REGISTRY.getByCategory(c).length > 0` 면 `RUN_CHECK_PLUGINS`를 implicit `measuredBy`에 추가. `checklist-mapping.ts`의 static `CATEGORY_META` 불변 — vibe-coder가 그 파일 수정할 일 없음.

### D.4 Migration Plan

3-phase, no big-bang:

**Phase 0 (Foundation) — 1주 / blocking**: types + registry + step 19 + AUDIT_STEPS 삽입 + smoke test. 빈 registry로도 정상 동작.

**Phase 1 (Net-new only) — 6주**: 새 check는 무조건 plugin. 기존 step 불변. Metric — PR diff ≤1 file, 추가 LoC <200.

**Phase 2 (Migration)**:

| 후보 | 분류 | 변환 |
|---|---|---|
| `prisma-analyzer` | 🟢 (DATA_MODEL `measuredBy: []` → scoring 영향 0) | ✅ |
| `design/consistency` | 🟢 (단일 entry analyzeDesignConsistency) | ✅ |
| `intent/risky-functions` | 🟢 (heuristic, ctx만 사용) | ✅ |
| `secret-patterns` | 🟡 (walk 무거움) | 보류 |
| semgrep | 🔴 (외부 binary) | step 유지 |
| ANALYZE_DEPLOY_URL | 🔴 (헤드리스 브라우저 60s+) | step 유지 |

**Mental model**: plugin = light-weight, deterministic, file-tree-bound checks. 외부 binary / network / 헤드리스 브라우저는 step.

### D.5 Plug-in 개발 가이드

1 file 예시 — `security.console-error-in-prod.check.ts`. 한 파일에 `id` / `version` / `category` / `bucket` / `displayName` (ko+en) / `summary` / `defaultSeverity` / `defaultConfidence` / `recommendation` / `acceptanceCriteria` / `tags` / `budget` / `applies` / `detect` 모두 포함. **다른 파일 변경 0개**.

**Review Checklist 11항목**:
- [ ] Security — secret 마스킹 (`maskedValue` only, raw 미저장)
- [ ] Security — **path traversal 방어** (`ctx.readFile` only, `node:fs` 금지)
- [ ] Security — **외부 네트워크 호출 금지** (fetch/http/dns/socket 금지)
- [ ] Performance — **cap 준수** (`budget.maxFiles` / `maxBytesPerFile` / `timeoutMs`)
- [ ] Category 정합성 (`AUDIT_CATEGORIES` 멤버)
- [ ] i18n completeness (ko + en 모두, zod 강제)
- [ ] Idempotency (동일 ctx → 동일 findings)
- [ ] False-positive 방지 (`applies` gate 정확)
- [ ] Test coverage (emit + skip + empty)
- [ ] Naming (`<category>.<verb-noun>`)
- [ ] No worker import (audit-core만 의존)

**Anti-patterns (review reject)**:
- `state.pendingFindings.push` 직접 호출
- `node:fs` / 외부 binary spawn
- Network call
- Mutable module-level state
- 자체 `Finding` / `Evidence` 타입 정의

---

## E. 품질 신뢰도 매트릭스

> **iteration 2 안내**: confidence-typer의 v2 응답 대기 중. v1 산출물 + ux-designer cross-check 결과(REQUEST_CHANGES) 통합본. **기존 production 컴포넌트 (`confidence-chip.tsx`, `false-positive-toggle.tsx`) 재사용 강조**.

### E.1 Finding-level Confidence

`FindingSchema`에 optional 필드 추가 (backward compat):

```ts
toolMeta: {
  toolName: string;           // 'semgrep' | 'osv-scanner' | 'lighthouse' | 'llm'
  toolVersion?: string;
  ruleId?: string;            // 'python.lang.security.audit.eval-injection'
  scoreOrigin?: ScoreOrigin;  // D/F/L/mixed/none 재활용
}
confidenceFactors: {          // 0-1 per axis
  ast?: number;
  runtime?: number;
  llm?: number;
  external?: number;
}
```

**Confidence 산출 알고리즘 (B.1과 호환)**:
- HIGH = `scoreOrigin in ['D','F']` AND `evidence.count >= 2`
- MEDIUM = `scoreOrigin === 'mixed'` OR `evidence.count === 1`
- LOW = `scoreOrigin === 'L'` OR `evidence.count === 0`

### E.2 Category Score Confidence

`CategoryScoreSchema` 확장 (optional):
```ts
confidenceBand: { lower: number; upper: number; method: 'bootstrap'|'heuristic'|'none' }
coverageRatio: number;  // 0.0 (모든 도구 SKIPPED) - 1.0 (모든 도구 정상)
```

Phase 1 도구 미설치 시 SECURITY_PRIVACY `coverageRatio=0.4`, band `±15점`.

### E.3 UI 노출 (수정 — ux-designer 피드백 반영)

**~~Radar mini-chart~~ — 제거** (FindingDetailPanel 이미 6 카드, 정보 과다).

**~~점 개수 표기~~ — 제거** (기존 `confidence-chip.tsx` 컬러 dot + "높음/보통/낮음" 유지).

**기존 컴포넌트 활용**:
- `confidence-chip.tsx` tooltip 강화 — "Semgrep (HIGH rule) + prisma-analyzer AST match → HIGH"
- `false-positive-toggle.tsx` 유지 — 피드백 사유 입력 modal로 UX 보강 (신규 버튼 만들지 않음)
- CategoryGrid의 OriginBadge — bottom-left 워터마크로 coverageRatio < 0.7 시 ⚠️ 표시 (top-right OriginBadge와 분리)
- ScoreOverview — "분석 신뢰도 87%" 숫자 대신 **"신호 충분/부족" 2단계 텍스트** (점수 옆 % 숫자 충돌 방지)

### E.4 Backward Compatibility

모든 신규 필드 `.optional()`. Firestore 컨버터 레이어에서 `doc.toolMeta ?? undefined` 패턴. 기존 문서 backfill 불필요 — 신규 audit run부터 채움. 레거시는 "출처 정보 없음" 배지로 graceful degradation.

### E.5 Vibe-coding 컨텍스트 (B.5와 통합)

**3단계 신뢰도 언어** (사용자 친화):

| 배지 | origin | 사용자 언어 | 예시 |
|---|---|---|---|
| HIGH (●●● 또는 ConfidenceChip 컬러) | D / F | "자동 도구가 코드/데이터에서 직접 확인" | "semgrep이 실제 line 245에서 발견" |
| MEDIUM | mixed | "자동 + AI 해석 혼합" | "Lighthouse 측정 + AI 분석 결합" |
| LOW | L | "AI 추론 기반 (수동 확인 권장)" | "LLM이 코드 패턴에서 추론 — 직접 확인 필요" |

**Vibe-coding 배너 (단일 — B.5와 통합)** — `.cursorrules`/`CLAUDE.md`/`AGENTS.md` 감지 시 ScoreOverview 위에:
> "이 프로젝트는 AI 생성 코드 비중이 높아 일부 findings는 의도된 패턴일 수 있습니다. 오탐으로 판단되면 Suppress 처리해주세요."

**Stacking order** (C.6과 일관):
`PartialResultBanner > Vibe-coding 배너 > BlockedBanner > ScoreOverview > Next30 > SeverityCounts > Strengths > Legend > CategoryGrid > Top5`

**inventorySignals 연계** (PR-A4-fix): `state.inventorySignals.{repoMetadata, dataModel, routes}` 가 true인 카테고리는 "source-driven evidence" 배지 추가 — 점수 미반영이지만 신뢰도 맥락으로 노출.

---

## F. Visual Surfacing — 트리뷰 + 플로우맵 (역방향 spec 추출)

> **포지셔닝 (2026-05-21 사용자 피드백)**: ClearToShip은 [manyfast.io](https://manyfast.io)의 **역방향**.
> manyfast: PRD/요구사항 → 코드 (forward)
> ClearToShip: **레포 + URL → 유저 플로우 / 트리뷰 / 기획 의도 추출 + 평가** (reverse)
> 단순 "audit"이 아니라 vibe-coded 프로젝트의 **시각적 reverse-spec-extraction**. 트리뷰/플로우 시각화가 핵심 차별화.

### F.1 무엇을 시각화 — 3개 layer

**Layer 1 — Tree View (계층 구조)**
- 발견된 페이지/API/component를 좌측 collapsible 사이드바 또는 mind map
- 그룹: "Pages" → Login/Dashboard/Pricing/... / "API endpoints" → /api/run, /api/audits/* / "Components" → Button/Card/Modal
- 메타: 각 노드에 finding count + origin badge + N/A 여부
- 데이터 source: `state.routeInventory` (PR-A3 ✅) + 향후 component AST scan

**Layer 2 — Flow Map (사용자 여정)**
- 노드: page (파란), API (초록), external service (보라)
- 엣지: `<Link href>` / `router.push` / `fetch()` / `useSWR` / API call
- 시작 노드: detected landing page (route="/")
- 분기: 인증 (login/signup) → main flow → action endpoints
- 데이터 source: route AST + import graph (PR-A3b 예정)

**Layer 3 — Page Card Grid (상세 정보)**
- 각 페이지 = 카드 (manyfast pattern)
- 카드 내용: 페이지 이름 + checklist.design 유형 + 발견된 컴포넌트 + 점수 + finding 요약
- 클릭 시 상세 모달

### F.2 manyfast 시각 패턴 벤치마킹

manyfast 분석 (2026-05-21 WebFetch):
- **Progressive disclosure** — 복잡한 구조를 카드/섹션 단계별 노출
- **Nested hierarchy** — 좌측 collapsible nav (예: "내 프로젝트" → 요구사항 / 기능명세서)
- **Icon-first** — 각 기능에 distinctive symbol (document / grid / flow arrows / wireframe)
- **Whitespace abundance** — 인지 부담 감소
- **Modular card system** — 일관된 카드 dimension, 독립 모듈로 시각
- **색상 절제** — neutral + dark text, CTA만 vibrant

ClearToShip 적용:
- 발견된 페이지 = 카드 (manyfast 스타일, 일관 dimension)
- 트리뷰 = 좌측 collapsible (manyfast 사이드바 패턴)
- 플로우맵 = 화살표 + 색상 코드 (manyfast의 flow arrows icon 정신)
- 비-개발자 친화: 카테고리 라벨 우선, 코드 디테일은 확장 시 노출

### F.3 새 컴포넌트 spec

| 컴포넌트 | 위치 | 책임 |
|---|---|---|
| `RepoTreeView` | dashboard 좌측 panel 또는 별도 tab | 페이지/API/component 계층 collapsible tree |
| `UserFlowMap` | dashboard 메인 또는 별도 tab | 페이지간 link 그래프 (React Flow 또는 D3) |
| `PageCard` | grid 안 단위 | 페이지 1개 = 카드 1개 (manyfast 카드 스타일) |
| `ComponentInventoryBadge` | PageCard 내부 | 발견된 컴포넌트 list (Button, Modal, Form 등) |
| `IntentSummaryCard` | dashboard 상단 | LLM 추출 의도 요약 (Phase B 후) |

기존 `apps/web/components/feature-graph/` 활용 — `build-graph.ts` 어댑터 + UI canvas 보강. React Flow library 후보 (이미 npm 생태계).

### F.4 데이터 흐름

```
Worker:
  state.routeInventory (D — PR-A3 ✅)
  state.componentInventory (D — Phase G NEW)
  state.flowEdges (D — Phase G NEW, route AST에서 추출)
  state.intentSummary (L — Phase B 후)
        ↓
AuditReport.visualSurfacing: {
  tree: { pages: [...], apis: [...], components: [...] },
  flow: { nodes: [...], edges: [...] },
  pageDetails: [{ id, type, components[], findings[], score? }]
}
        ↓
Web:
  RepoTreeView, UserFlowMap, PageCard grid
```

### F.5 단계별 구현 (새 Phase G)

| Step | scope | 추정 | 의존 |
|---|---|---|---|
| G.1 | RepoTreeView (Layer 1) — routeInventory 기반 페이지/API 계층 | 1주 | PR-A3 (있음) |
| G.2 | Component AST scan + state.componentInventory + ComponentInventoryBadge | 1주 | G.1 |
| G.3 | UserFlowMap (Layer 2) — React Flow 또는 D3, route AST + Link/router edges | 2주 | G.2 + PR-A3b |
| G.4 | PageCard grid (Layer 3) — checklist.design 매칭 (V1 from project_visual_audit_vision.md) | 1주 | G.1 |
| G.5 | LLM IntentSummaryCard — README + CLAUDE.md 의도 추출 | 1주 | Phase B (LLM 도입) |

총 ~6주. G.1+G.4는 단독 가능 (~2주 만으로도 시각적 변혁).

### F.6 사용자 시나리오 — "내 프로젝트가 어떻게 생겼나"

**Before (현재)**:
- 사용자가 cleartoship audit 결과 페이지를 봐도 점수 + finding list만 표시
- "내 프로젝트의 페이지 구조는?" / "사용자 흐름은?" / "어디가 weak link?" 모름

**After (Phase G 후)**:
- 좌측 RepoTreeView — 23개 페이지 + 17개 API endpoint 계층 표시
- 중앙 UserFlowMap — Landing → Login → Dashboard → Audit submit → Result 흐름
- 우측 PageCard — 클릭한 페이지의 컴포넌트 + finding + checklist.design 권장사항
- 비-개발자도 "**아, 내 프로젝트는 이렇게 생겼구나**" 한눈에 이해

차별화: 기존 audit 도구들은 점수/리스트. ClearToShip은 **시각적 reverse-spec 시뮬레이션** — manyfast가 forward로 만드는 것을 거꾸로 인식.

---

## G. 통합 — 영역 간 일관성 + 미해결 충돌

5개 영역의 cross-check 결과 정리:

| 영역 | cross-check | 핵심 피드백 | 상태 |
|---|---|---|---|
| A | (leader fallback — 재검토 권장) | — | DRAFT |
| B | ux-designer 검토 진행 | — | v1 |
| C | (자체 grounded) | — | OK |
| D | quality-reviewer (REQUEST_CHANGES → 5건 반영) | NormalizedFinding SSOT, index 14, category enum 강제, 🟡→🟢 prisma, 보안 checklist 3항목 | v2 ✅ |
| E | ux-designer (REQUEST_CHANGES → v2 진행 중) | radar/dots 제거, ConfidenceChip 재사용, false-positive-toggle 재사용, stacking order | v2 작성 중 |

**해소된 충돌**:
- B.5의 confidence badge + E.3 UI spec → 기존 `confidence-chip.tsx` tooltip 강화로 통합
- B.5의 vibe-coding 경고 배너 + E.5의 같은 배너 → 단일 배너
- C.5의 Legend + E.3의 origin 뱃지 → 단일 collapsible "이 점수는 어떻게 산출됐나요?" 패널

**미해결 (Phase 0 결정 필요)**:
- Q1 — Plug-in 변환 시점: Phase 2에서 prisma/design/risky-functions 함께 변환 vs 새 plugin만 추가하고 기존 step 유지?
- Q2 — Suppress 메커니즘 3-tier 모두 vs 최소 1개? 인라인 주석 (B.3-1) 만으로 시작?
- Q3 — Vibe-coding 배너 트리거 조건: `.cursorrules` / `CLAUDE.md` / `AGENTS.md` 중 하나만? OR 조합?
- Q4 — Next 30min Checklist (C.1) 우선순위: localStorage 만 vs Firestore persist (계정별 동기화)?
- Q5 — A.2 plug-in 8개를 Phase 2에서 한 번에 vs 우선순위 4개 (HIGH) 먼저?

---

## H. 구현 로드맵

| Phase | scope | 추정 | 의존 |
|---|---|---|---|
| **0 (Foundation)** | D — plug-in types + registry + step 19 삽입 | 1주 | 없음 |
| **1 (High-impact UX)** | C.2 Narrative 바인딩 + C.4 N/A 카테고리별 정확화 + C.5 Legend 통합 | 1주 | 0 |
| **2 (Vibe-coding plugins)** | A.2 V1/V2/V5/V6 (HIGH 4개) + secondary 4개 | 2주 | 0, PR #38 (V2/V6/V7) |
| **3 (Quality + confidence)** | B.1 confidence 정량화 + E.1 toolMeta 필드 + Suppress 메커니즘 (인라인 주석 + `.cleartoshipignore`) | 2주 | 1 |
| **4 (Next 30min)** | C.1 + actionHint 정밀화 | 1주 | 1 |
| **5 (Migration)** | D.4 Phase 2 — prisma/design/risky-functions plugin 변환 | 1주 | 0 |
| **6 (Cleanup)** | B.4 coverageGaps + B.5 vibe-coding 배너 + 작은 polish | 1주 | 3 |
| **G (Visual Surfacing) ⭐ NEW** | F — 트리뷰 + 플로우맵 + PageCard grid. **차별화 핵심** (manyfast 역방향 positioning) | 2주 (G.1+G.4 MVP) ~ 6주 (전체) | PR-A3 (있음), G.4는 PR-A3b 권장 |

총 추정 ~9-15주. Phase 0/1/G 머지 후 2/3은 parallel 가능. **Phase G의 G.1+G.4 MVP (2주)** 만으로도 사용자 체감 큰 변혁.

**가장 빠른 첫 ship sequence** (2주 sprint):
- 1주차: Phase 0 (plug-in foundation) + Phase G.1 (RepoTreeView)
- 2주차: Phase 1 (UX C.2+C.4) + Phase G.4 (PageCard grid)
- 결과: vibe coder가 audit 결과 봤을 때 (a) 점수의 Narrative 1문장, (b) 트리뷰로 페이지 구조, (c) 페이지별 카드 — 차별화 핵심 다 갖춤

---

## I. 참고

- 직전 전수검사: 이 세션의 Explore agent 분석 — 분석 엔진 80%, UI 40% 진단
- 관련 PRD: `docs/PRD/source-driven-extraction-2026-05-20.md` (D/F/L bucket), `docs/PRD/phase0-worker-tooling-2026-05-19.md`
- 머지된 PR: #36/#37 (Phase 0), #39 (UX SKIP+strengths), #40 (deploy bypass), #41 (source-driven PRD), #42/#43/#44/#45/#46/#47 (A1-A4 + fix)
- 대기: PR #38 (Phase 1 semgrep+osv) — 5번째 시도 권장 (`returntocorp/semgrep` multi-stage)
- 메모리: `.claude/memory/feedback_pipx_python_docker.md`, `project_visual_audit_vision.md`, `feedback_gcloud_iam_wif.md`

---

**팀 멤버**:
- checklist-architect (planner / opus) — A: leader fallback으로 대체
- quality-reviewer (code-reviewer / sonnet) — B: v1 + D cross-check
- ux-designer (frontend-developer / opus) — C: v1 + E/B cross-check
- plugin-architect (architect / opus) — D: v2 (5건 반영)
- confidence-typer (typescript-pro / sonnet) — E: v2 진행 중 (5건 반영 대기)

