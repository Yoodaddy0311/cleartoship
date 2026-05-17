# PRD: ClearToShip Launch Sharpen — 확장판 (2026-05-18)

**작성일**: 2026-05-18
**작성자**: w2a-planner (Opus 4.7) — design-only, no code change
**상위 PRD**: [finalize-launch-2026-05-18.md](./finalize-launch-2026-05-18.md) (544줄)
**Appendix**: [A-wireframes](./appendix-A-wireframes.md) / [B-copywriting](./appendix-B-copywriting.md) / [C-coverage-matrix](./appendix-C-coverage-matrix-spec.md) / [D-action-hint](./appendix-D-action-hint-dictionary.md)
**Launch Target**: 2026-06-05 (base PRD 2026-06-14 대비 9일 단축)

---

## 0. Executive Summary

ClearToShip은 "ship-readiness" code audit이라는 카테고리에서 No-LLM 결정론을 무기로 차별화된다. 그러나 **현재 결과 리포트는 7-block stack에서 그치며 "전문성"과 "핵심을 찌르는 결정 가독성"이 부족하다**. 본 PRD는 (A) Sprint 1~3 완료/미완료 전수 정리, (B) USP 3 옵션 평가 및 1·2순위 선정, (C) 새 10-block 인사이트 stack 설계, (D) 5-Wave 16.5일 실행 로드맵을 정의한다.

**핵심 결정**:
- **Sprint 3 P0**: 6/7 완료 (T3.0 deferred). P1 7건 재평가 → L-P1-3 Narrative를 P0로 승격, L-P1-2 feature-graph adapter test는 P2로 강등.
- **Sharper Core 1순위**: **Option 1 — Founder Confidence Score (FCS) with uncertainty bar**. No-LLM, 2일 effort, DATA POLICY 안전, 기존 weighted-score 재사용. 2순위: Option 2 Pre-Launch Rehearsal (Playwright-based).
- **Insight Reorg**: 기존 7-block → 새 10-block stack. FCS는 §2로 hero 위치 차지, CategoryGrid §6 신규, Next 30min §7 신규.
- **Phase 4.5 follow-up**: 4건 (ghostButtonHeuristicForced / coverage-matrix truncate / primaryPath fallback / BUSINESS_READINESS tie-break) Wave 4에 묶음 처리 (1.5d).
- **Launch**: 16.5 effective day → 2026-06-05.

---

## §A. Status Sweep — Sprint 1·2·3 완료/미완료 전수 정리

### A.1 완료된 작업 전수표 (1579 PASS baseline)

#### A.1.1 Round 1·2·3·4 (Phase 0 base)
| Round | 주제 | 완료물 |
|---|---|---|
| R1 | Foundation | apps/web Next.js 15 + monorepo + Firestore emulator + Cloud Tasks emulator 셋업 |
| R2 | Audit Domain | AuditRunSchema (zod), 12 categories enum, profiles 3개, severity P0~P3 + confidence 3-axis |
| R3 | Scoring | confidence-weighted 점수, weight invariant=100 test (`packages/audit-core/src/calculate-scores.test.ts:16`), profile별 weight matrix |
| R4 | Pipeline | 20-step Cloud Tasks 워크플로, ctx 직렬화, Firestore live status, 실패 retry budget |

#### A.1.2 Phase 1 (W1-A, W1-B)
| Item | 완료물 |
|---|---|
| W1-A measuredBy | 80+ rule detector implementations (`packages/audit-core/src/detectors/`) — fs-based, deterministic |
| W1-B checklist | 80+ Checklist ID (`packages/shared-types/src/checklist-ids.ts`) + Rule→Checklist mapping in audit-core SSOT |
| W1-B coverage matrix | `coverage-matrix.ts` + `coverage-matrix.test.ts` — claim×checklist×finding cross-table |
| Storage | Firestore docs/runs/{runId} + subcollections (findings, claims, evidences) |

#### A.1.3 Phase 2 (W2-A planning, W2-B partial, W2-C ANALYZE_PRD)
| Item | 상태 | 완료물 |
|---|---|---|
| W2-A PRD upload | **planning done** (`docs/PRD/w2a-prd-upload.md`, 7,505 B) | 1.5d 실행계획, AC1~AC9, 13 deliverable files |
| W2-B coverage matrix UI | partial | 백엔드 산출 + minimal table render. Narrative/grouping 미완 |
| W2-C ANALYZE_PRD | done | step04c-analyze-prd.ts (fs scan), ctx.prdAnalysis emit |
| Severity tie-break | done | P0>P1>P2>P3 deterministic ordering |
| Confidence weighting | done | confidence_weight = {HIGH:1.0, MEDIUM:0.7, LOW:0.4} |

#### A.1.4 Phase 3 (Sprint 3 P0 — 6/7 완료)
| ID | 주제 | 상태 |
|---|---|---|
| T3.1 | LaunchStatus 7-enum 도입 (INDETERMINATE, BLOCKED 추가) | done |
| T3.2 | BUSINESS_READINESS step14 weight=0 default-pass | done |
| T3.3 | profile 4번째 vibe-coded 스키마 enum 등록 | done |
| T3.4 | action-hint dictionary appendix D 42-entry SSOT | done (`packages/audit-core/src/finding-action-hints.ts`) |
| T3.5 | rule-family duplication 제거 (CC-117) | done (audit-core import만 사용) |
| T3.6 | wireframe appendix A 5+3 mockup | done |
| **T3.0** | **vibe-coded profile detector 구현** | **deferred → Wave 3** |

**Baseline 검증**: 1579 PASS / 0 FAIL (2026-05-17 22:30 KST)
- `packages/audit-core`: 612 PASS
- `packages/shared-types`: 89 PASS
- `workers/audit-worker`: 478 PASS
- `apps/web`: 400 PASS

### A.2 Sprint 3 P1 7건 — 재평가 및 우선순위 재배치

#### L-P1-1 ProfileBadge i18n 보강
- **현재 위치**: `apps/web/components/profile-badge.tsx`
- **문제**: ko 키는 있으나 en 키 누락 (profile.vibeCoded.label)
- **DoD**: en/ko 양쪽 i18n 키 존재, snapshot test 추가 (`profile-badge.test.tsx`)
- **재평가**: P1 유지. Wave 3에서 W2-A UI 작업과 묶음 처리 (0.25d)

#### L-P1-2 feature-graph adapter test
- **현재 위치**: `packages/audit-core/src/feature-graph/adapter.ts`
- **문제**: edge type=DEPENDS_ON / IMPORTS 분기 테스트 부재 → regression 위험
- **DoD**: edge type 양쪽 케이스 + circular dep 검출 + unit test 4개 이상
- **재평가**: **P1 → P2 강등**. 사용자 가시 기능 아니며 현재 1579 PASS에서 회귀 없음. Wave 5 cleanup으로 이동 (0.5d)

#### L-P1-3 Narrative 컴포넌트
- **현재 위치**: 없음 (신규)
- **문제**: 점수만 보고 "왜?"를 모름 → 결과의 핵심을 못 짚는 핵심 원인
- **DoD**: 3-sentence template ({verdict}/{topRule}/{nextAction}) + i18n + storybook mockup + a11y AA
- **재평가**: **P1 → P0 승격**. §B Sharper Core·§C Insight Reorg의 §3 블록과 직결. Wave 2 핵심 산출물 (1.5d)

#### L-P1-4 EvidencePanel collapse 상태 persistence
- **현재 위치**: `apps/web/components/evidence-panel.tsx`
- **문제**: 새로고침 시 collapse 상태 초기화
- **DoD**: localStorage key=`cts.evidence.collapsed.{ruleId}` + SSR hydration mismatch 방지 + e2e test
- **재평가**: P1 유지 (UX 마감 품질). Wave 4 (0.5d)

#### L-P1-5 ko/en toggle 페이지 즉시 반영
- **현재 위치**: `apps/web/components/lang-toggle.tsx`
- **문제**: 토글 후 SSR 캐시 때문에 일부 컴포넌트가 stale string 표시
- **DoD**: revalidatePath 호출 + 클라이언트 hard-refresh fallback + visual regression test
- **재평가**: P1 유지. Wave 3 (0.5d)

#### L-P1-6 Skeleton loading state
- **현재 위치**: `apps/web/app/(audit)/runs/[runId]/page.tsx`
- **문제**: 첫 fetch 동안 빈 화면 → 체감 속도 저하
- **DoD**: ShipVerdictSkeleton/ScoreSkeleton/NarrativeSkeleton + suspense boundary + perf budget < 100ms TTI gain
- **재평가**: P1 유지. Wave 2와 묶음 (0.5d)

#### L-P1-7 Mobile 360px 정렬 회귀 가드
- **현재 위치**: `apps/web/__tests__/visual/`
- **문제**: 디자인 단계에서 360px 가드 정의했으나 자동 회귀 테스트 없음
- **DoD**: Playwright viewport=360x640 visual diff baseline + CI gate
- **재평가**: P1 유지. Wave 4 (0.5d)

**P1 재평가 결과**:
- P0 승격: L-P1-3 (1건)
- P1 유지: L-P1-1, L-P1-4, L-P1-5, L-P1-6, L-P1-7 (5건)
- P2 강등: L-P1-2 (1건)
- 총 P1 effort: 2.25d

### A.3 미완료/연기 항목 (W2-A, W2-B, W3, #45, #96)

#### W2-A PRD upload — design done, impl deferred
- **PRD**: `docs/PRD/w2a-prd-upload.md` (7,505 B)
- **상태**: 8-section spec + 13 deliverable files + AC1~AC9 정의 완료
- **실행 예정**: Wave 3 (1.5d)
- **잔여 위험**: PrdTextTooLargeError 422 매핑이 PerIpRateLimitError 429와 충돌하지 않는지 status code 매트릭스 재확인 필요

#### W2-B coverage matrix UI — partial → full
- **현재**: 백엔드 산출, 프론트 minimal table only
- **잔여**: Narrative grouping / claim-status badge color / mobile 가로 스크롤 hint
- **실행 예정**: Wave 2 insight reorg와 동시 (포함 effort 1.0d)

#### W3 vibe-coded profile detector (T3.0)
- **현재**: profile enum만 등록, detector 미구현
- **DoD**: package.json scripts.dev/build 패턴 + tailwind/shadcn detect + 30+ vibe-coded sample fixtures + e2e test
- **실행 예정**: Wave 3 (1.0d)

#### Issue #45 (이번 팀의 본 이슈)
- **주제**: Sharpen + status sweep + insight reorg + roadmap PRD 작성
- **현재**: 본 PRD가 그 산출물 (Wave 0)

#### Issue #96 — deferred
- **주제**: BUSINESS_READINESS LLM optional 보강 (BYOK)
- **상태**: deferred to Phase 5 (post-launch). DATA POLICY 통과 후 BYOK 옵션으로만 활성화
- **실행 예정**: 본 PRD 범위 외

### A.4 Phase 4.5 Follow-up Issues — 4건 묶음 처리

#### A.4.1 ghostButtonHeuristicForced — profile-level override 누수
- **현재 위치**: `packages/audit-core/src/profiles/index.test.ts` (test name: "ghostButtonHeuristicForced")
- **문제**: SaaS profile에서 ghost-button 검출 강제 enable 플래그가 landing profile 테스트로 누수
- **Fix Plan**:
  1. `Profile` 타입에 `overrides?: Record<RuleId, boolean>` 명시
  2. `getProfile(name).overrides` deep-freeze 처리
  3. test fixture profile 인스턴스를 매 케이스 fresh 생성 (mutation 방지)
- **Effort**: 0.5d
- **Wave**: 4

#### A.4.2 coverage-matrix truncate 유틸 부재
- **현재 위치**: `packages/audit-core/src/coverage-matrix.ts`
- **문제**: claim text가 500+ 글자일 때 UI 깨짐 + i18n 라벨도 길이 제어 없음
- **Fix Plan**:
  1. `packages/audit-core/src/utils/truncate.ts` 신규 (UTF-8 grapheme 안전, ellipsis 옵션)
  2. coverage-matrix.ts에서 claim.text/claim.label 모두 적용
  3. unit test (3-byte UTF-8 boundary / emoji / 0-length / null) 4개
- **Effort**: 0.25d
- **Wave**: 4

#### A.4.3 primaryPath fallback — render-coverage 누락 시 빈 문자열 노출
- **현재 위치**: `packages/audit-core/src/coverage-matrix.ts` (primaryPath resolver)
- **문제**: detector가 evidence 없을 때 primaryPath=undefined → UI에서 "" 렌더
- **Fix Plan**:
  1. `resolvePrimaryPath(evidences): string | null` 명시 반환 타입
  2. null 시 UI에서 "경로 정보 없음" / "Path unavailable" i18n 렌더
  3. coverage-matrix.test.ts에 fallback 케이스 추가
- **Effort**: 0.25d
- **Wave**: 4

#### A.4.4 BUSINESS_READINESS tie-break — weight=0 카테고리 정렬 안정성
- **현재 위치**: `packages/audit-core/src/calculate-scores.ts`
- **문제**: BUSINESS_READINESS는 weight=0이므로 score 정렬 시 동률 다수 발생 → 카테고리 표시 순서 비결정
- **Fix Plan**:
  1. tie-break key: weight DESC → enum index ASC (deterministic)
  2. `calculate-scores.test.ts`에 BUSINESS_READINESS 포함 12 카테고리 순서 snapshot test
  3. UI CategoryGrid §6에서도 동일 순서 사용 보장
- **Effort**: 0.5d
- **Wave**: 4

**Phase 4.5 총합**: 1.5d (Wave 4에 묶음)

---

## §B. Sharper Core — USP 3 옵션 평가 및 1·2순위 선정

### B.0 평가 축 (10 axes)

| Axis | 설명 | 가중치 |
|---|---|---|
| 1. DATA POLICY 안전성 | No-LLM 결정론 유지 / 외부 코드 전송 없음 | 25% |
| 2. 5일 launch 가능성 | 2026-06-05까지 ship 가능한가 | 20% |
| 3. 차별화 강도 | 경쟁사 (Codacy/SonarCloud/DeepSource) 대비 wedge | 15% |
| 4. 마케팅 효과 | 한 문장으로 hero copy 가능한가 | 10% |
| 5. 기존 인프라 재사용 | 새 의존성 추가 최소 | 10% |
| 6. BYOK 의존도 | LLM API key 필요 여부 (낮을수록 좋음) | 10% |
| 7. 사용자 학습 곡선 | 1분 안에 가치 이해 | 5% |
| 8. 신뢰 가능성 | 결과를 "믿을 만한가" 직관 | 3% |
| 9. 유지보수 cost | 후속 sprint 부담 | 1% |
| 10. 법적 risk | 과장 광고 / 책임 회피 표현 | 1% |

### B.1 Option 1: Founder Confidence Score (FCS) with Uncertainty Bar

#### B.1.1 컨셉
"이 코드베이스를 지금 ship 해도 되는가?"에 대한 **단일 숫자(0-100) + 불확실성 막대**. 점수만 보여주는 게 아니라, **신뢰 구간 (confidence interval)** 을 시각화하여 "이 점수가 ±몇 점 흔들릴 수 있는지"를 보여준다.

#### B.1.2 알고리즘 (pseudocode)
```typescript
interface FCSResult {
  score: number;           // 0~100 weighted score
  lower: number;           // score - uncertainty
  upper: number;           // score + uncertainty
  uncertainty: number;     // 0~30, derived from confidence axis
  status: LaunchStatus;    // 7-enum
  topConcerns: Concern[];  // 1~3 highest-impact P0/P1 findings
  rationale: string;       // 1-sentence narrative
}

function computeFCS(
  scores: CategoryScore[],
  findings: Finding[],
  profile: Profile,
): FCSResult {
  // 1. base score = 기존 confidence-weighted score
  const base = computeWeightedScore(scores, profile.weights);

  // 2. uncertainty = LOW confidence finding 비율 + INDETERMINATE category 수
  const lowConfRatio = findings.filter(f => f.confidence === 'LOW').length / findings.length;
  const indeterminateCats = scores.filter(s => s.status === 'INDETERMINATE').length;
  const uncertainty = Math.min(30, lowConfRatio * 20 + indeterminateCats * 3);

  // 3. lower/upper bound (clamp 0~100)
  const lower = Math.max(0, base - uncertainty);
  const upper = Math.min(100, base + uncertainty);

  // 4. topConcerns = severity weight × confidence weight 상위 3개
  const topConcerns = findings
    .map(f => ({ ...f, impact: SEVERITY_WEIGHT[f.severity] * CONFIDENCE_WEIGHT[f.confidence] }))
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 3);

  // 5. status = LaunchStatus 7-enum 결정 트리
  const status = deriveLaunchStatus(base, uncertainty, topConcerns);

  // 6. rationale = i18n template (No-LLM)
  const rationale = renderRationale(status, topConcerns[0], profile.name);

  return { score: base, lower, upper, uncertainty, status, topConcerns, rationale };
}
```

#### B.1.3 평가 (10 axes)
| Axis | Score | 비고 |
|---|---|---|
| DATA POLICY | 10/10 | 100% No-LLM, 기존 detector 결과만 사용 |
| 5일 launch | 9/10 | 2d effort, 기존 weighted-score 확장만 |
| 차별화 | 8/10 | 경쟁사 누구도 "uncertainty bar" 시각화 안 함 |
| 마케팅 | 9/10 | "78점 ± 6점. ship 해도 될지 한눈에." |
| 인프라 재사용 | 10/10 | calculate-scores.ts 확장, 신규 deps 0 |
| BYOK 의존 | 10/10 | 불필요 |
| 학습 곡선 | 9/10 | 점수 + 막대 = 1초 이해 |
| 신뢰 | 8/10 | 불확실성 명시가 오히려 신뢰 증대 |
| 유지보수 | 9/10 | pure function, snapshot test 쉬움 |
| 법적 risk | 9/10 | "추정" 표현 + uncertainty 명시로 과장 회피 |

**Weighted total**: **9.05 / 10**

#### B.1.4 산출물
- `packages/audit-core/src/fcs/compute-fcs.ts` (신규, ~120 LoC)
- `packages/audit-core/src/fcs/compute-fcs.test.ts` (snapshot + property test, ~200 LoC)
- `apps/web/components/founder-confidence-score.tsx` (gauge + uncertainty bar, ~150 LoC)
- `packages/shared-types/src/fcs.ts` (FCSResult 타입, ~30 LoC)
- i18n 키 12개 (status × 2 lang + uncertainty label × 2 lang + concern label × 2 lang)

#### B.1.5 위험 / 완화
- **R-FCS-1**: uncertainty 공식 임의성 → property-based test로 monotonicity 검증
- **R-FCS-2**: 너무 큰 uncertainty bar 노출 시 신뢰도 저하 인상 → max=30 cap + 30 초과 시 status=INDETERMINATE 강제
- **R-FCS-3**: 점수 변동 시 사용자 혼란 → "왜 점수가 변했나" Δ 표시 + diff narrative

### B.2 Option 2: Pre-Launch Rehearsal (Playwright + Stripe sandbox)

#### B.2.1 컨셉
사용자가 결제 페이지 URL을 입력하면 Playwright 헤드리스 브라우저로 **실제 결제 플로우**를 자동 수행 (Stripe test card 사용). "결제까지 막힘 없이 작동하는가"를 결정론적으로 검증.

#### B.2.2 알고리즘 (pseudocode)
```typescript
async function runRehearsal(
  startUrl: string,
  scenario: 'signup' | 'checkout' | 'subscription',
): Promise<RehearsalResult> {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const steps: RehearsalStep[] = [];
  const recorder = recordPerformance(page);

  try {
    await page.goto(startUrl, { timeout: 10_000 });
    steps.push({ name: 'navigate', status: 'pass', durationMs: ... });

    if (scenario === 'checkout') {
      const ctaSelector = await detectPrimaryCta(page); // No-LLM heuristic
      await page.click(ctaSelector);
      steps.push({ name: 'click_cta', status: 'pass', ... });

      await page.fill('[data-testid=card-number]', '4242424242424242'); // Stripe test
      ...
    }

    return { status: 'pass', steps, recordings: recorder.flush() };
  } catch (err) {
    return { status: 'fail', steps, error: err.message };
  } finally {
    await browser.close();
  }
}
```

#### B.2.3 평가
| Axis | Score | 비고 |
|---|---|---|
| DATA POLICY | 5/10 | 사용자 사이트로 실제 트래픽 발생, Stripe 통신 |
| 5일 launch | 4/10 | Playwright infra + Stripe sandbox 연동 + 시나리오 빌더 = 4-5d |
| 차별화 | 9/10 | 정말 인상적 |
| 마케팅 | 10/10 | "실제 결제까지 돌려봤습니다" 한 문장 |
| 인프라 재사용 | 3/10 | Playwright runner / Stripe SDK 신규 |
| BYOK 의존 | 6/10 | Stripe sandbox key 필요 (test, but 사용자 입력) |
| 학습 곡선 | 7/10 | URL + scenario 선택 |
| 신뢰 | 9/10 | 실제 동작 검증 = 최고 신뢰 |
| 유지보수 | 4/10 | 사이트 UI 변경마다 selector 재조정 |
| 법적 risk | 5/10 | "허가 없이 사이트 스캔" 우려, robots.txt 준수 필요 |

**Weighted total**: **6.30 / 10**

#### B.2.4 위험
- **R-REH-1**: 사이트 owner consent 부재 시 ToS 위반 위험 → "본인 사이트만" 명시 + robots.txt 확인 + rate limit
- **R-REH-2**: selector 변경 회귀 → AI-free heuristic detector + 사용자가 selector 명시 옵션
- **R-REH-3**: 5d launch에 맞지 않음 → Wave 5 이후 (post-launch)

### B.3 Option 3: Launch Day War Room (4-vendor integration)

#### B.3.1 컨셉
Launch 당일 dashboard. Vercel + Stripe + Sentry + Plausible 4개 vendor API를 연결하여 실시간 deploy status / payment success rate / error spike / traffic 그래프를 한 화면에 통합.

#### B.3.2 평가
| Axis | Score | 비고 |
|---|---|---|
| DATA POLICY | 4/10 | 4개 외부 API token 보관 |
| 5일 launch | 2/10 | 4 vendor OAuth + dashboard = 7-10d |
| 차별화 | 6/10 | 비슷한 도구 다수 (Datadog, Better Stack) |
| 마케팅 | 7/10 | "Launch Day 단일 대시보드" |
| 인프라 재사용 | 2/10 | 4 SDK 신규 |
| BYOK 의존 | 2/10 | 4개 OAuth 강제 |
| 학습 곡선 | 4/10 | 4 vendor 셋업 부담 |
| 신뢰 | 7/10 | 실데이터 |
| 유지보수 | 3/10 | 4 vendor SDK 버전 추적 |
| 법적 risk | 6/10 | 각 vendor ToS 준수 |

**Weighted total**: **4.10 / 10**

### B.4 선정 결과 및 종합 매트릭스

| Option | Weighted Score | 5d 가능 | DATA POLICY | 권고 |
|---|---|---|---|---|
| **1. FCS** | **9.05** | YES | 안전 | **1순위** (Wave 1, 2d) |
| **2. Pre-Launch Rehearsal** | **6.30** | NO (4-5d) | 위험 | **2순위** (Post-launch Phase 5) |
| 3. War Room | 4.10 | NO (7-10d) | 위험 | 보류 (Phase 6+) |

**최종 결정**:
1. **Option 1 (FCS)** — Wave 1에서 즉시 구현. Hero 위치 (insight stack §2) 차지.
2. **Option 2 (Rehearsal)** — Launch 후 Phase 5 marquee feature로 확장 PRD 작성.
3. Option 3는 보류 (사용자 수요 검증 후 재평가).

**1순위 근거 한 줄**: *Option 1 Founder Confidence Score (FCS) — No-LLM, 2d effort, 5일 내 launch 가능, DATA POLICY 완전 안전, 기존 weighted-score 재사용으로 위험 최소.*

---

## §C. Insight Reorganization — 새 10-Block Stack 설계

### C.0 기존 vs 새 비교

| # | 기존 7-block (base PRD §3.3) | 새 10-block (본 PRD) |
|---|---|---|
| 1 | ShipVerdict (verdict + score) | ShipVerdict (verdict only, score 분리) |
| 2 | ScoreGauge | **FCS Gauge + Uncertainty Bar (신규 hero)** |
| 3 | TopConcerns | Narrative (3-sentence, neu L-P1-3) |
| 4 | CategoryBreakdown | TopConcerns (1~3건, action-hint 포함) |
| 5 | FindingsList | **Next 30min (즉시 실행 가능 액션 3건, 신규)** |
| 6 | CoverageMatrix | **CategoryGrid (12-카테고리 2×6 grid, 신규)** |
| 7 | EvidencePanel | FindingsList (filter + sort) |
| 8 | — | CoverageMatrix (claim×checklist) |
| 9 | — | EvidencePanel (collapse-persist L-P1-4) |
| 10 | — | RunMetadata (timestamp, profile, version) |

### C.1 §1 ShipVerdict — 7-enum LaunchStatus

| 항목 | 명세 |
|---|---|
| Data source | `run.launchStatus: LaunchStatus` (7-enum) |
| UI component | `ShipVerdictBanner` (apps/web/components/ship-verdict-banner.tsx) |
| Variants | READY (green) / READY_WITH_CAVEATS (lime) / NEEDS_WORK (yellow) / AT_RISK (orange) / NOT_READY (red) / INDETERMINATE (grey) / BLOCKED (dark red) |
| i18n keys | `verdict.ready.label` / `.headline` / `.subtext` × 7 status × 2 lang = 42 keys |
| Length cap | headline ≤ 24자 (ko) / ≤ 40자 (en), subtext ≤ 80자 |
| Visualization | full-width banner, hero icon (32px), AA contrast 4.5:1+ |
| Mobile 360px | 단일 column, icon 24px, headline 18px |

### C.2 §2 FCS Gauge + Uncertainty Bar (NEW HERO)

| 항목 | 명세 |
|---|---|
| Data source | `run.fcs: FCSResult` (B.1.2 알고리즘) |
| UI component | `FounderConfidenceScore` (apps/web/components/founder-confidence-score.tsx) |
| Variants | gauge (0-100 arc) + bar (lower~upper range overlay) |
| i18n keys | `fcs.score.label` / `fcs.uncertainty.label` / `fcs.lower.label` / `fcs.upper.label` / `fcs.rationale.template` × 2 lang = 10 keys |
| Length cap | rationale ≤ 90자 (ko) / ≤ 140자 (en) |
| Visualization | SVG arc gauge (240×120), uncertainty bar overlay (alpha 0.3), 점수 38pt 굵게 |
| Mobile 360px | gauge 200×100, 점수 32pt |
| A11y | aria-valuenow / valuemin / valuemax + `<output role="status">` for rationale |

### C.3 §3 Narrative — 3-sentence template

| 항목 | 명세 |
|---|---|
| Data source | `run.narrative: NarrativeResult` (신규) |
| UI component | `Narrative` (apps/web/components/narrative.tsx) — L-P1-3 |
| Template | `{verdictSentence}. {topRuleSentence}. {nextActionSentence}.` |
| i18n keys | `narrative.verdict.{status}` × 7 + `narrative.topRule.{ruleId}` × 80+ + `narrative.nextAction.{ruleId}` × 80+ = ~340 keys × 2 lang |
| Length cap | 각 문장 ≤ 60자 (ko) / ≤ 100자 (en), 전체 ≤ 180자 (ko) |
| Visualization | inline text, 16px regular, line-height 1.6, max-width 720px |
| Tone | 직설 + 신중 (appendix B 기준), "should/may" 영어 동사 회피 → 명령형 |

### C.4 §4 TopConcerns — 1~3 high-impact findings

| 항목 | 명세 |
|---|---|
| Data source | `fcs.topConcerns: Concern[]` (max 3) |
| UI component | `TopConcernsList` (apps/web/components/top-concerns-list.tsx) |
| Each item | severity badge + rule name + 1-line excerpt + action-hint (appendix D dict) + ETA pill |
| i18n keys | reuse `rule.{ruleId}.short` + `actionHint.{family}.label` + `eta.{minutes}.label` |
| Length cap | excerpt ≤ 80자, action-hint ≤ 40자 |
| Visualization | card stack, severity color border-left 4px |

### C.5 §5 Next 30min — 즉시 실행 가능 액션 3건 (NEW)

| 항목 | 명세 |
|---|---|
| Data source | findings where `actionHint.etaMinutes ≤ 30` sorted by impact, top 3 |
| UI component | `Next30MinChecklist` (apps/web/components/next-30min-checklist.tsx) — NEW |
| Each item | checkbox + action title + file path + ETA badge + "왜 중요한가" tooltip |
| i18n keys | `next30.heading.label` / `next30.tooltip.{ruleId}` × 80+ × 2 lang |
| Length cap | action title ≤ 50자 |
| Visualization | numbered list (1/2/3), 체크 시 strikethrough + localStorage persist |
| Empty state | "30분 안에 처리할 게 없습니다 — 더 큰 항목으로 넘어가세요" |

**가치 명제**: 점수만 보여주는 게 아니라 "지금 당장 무엇을 할지" 직접 지시. **이게 sharper core의 결정 가독성**.

### C.6 §6 CategoryGrid — 12 카테고리 2×6 grid (NEW)

| 항목 | 명세 |
|---|---|
| Data source | `run.scores: CategoryScore[]` (12개), tie-break A.4.4 적용 |
| UI component | `CategoryGrid` (apps/web/components/category-grid.tsx) — NEW |
| Each cell | category icon + score + mini-trend arrow (직전 run 대비) + click → §7 filter |
| i18n keys | `category.{name}.label` × 12 × 2 lang |
| Length cap | label ≤ 14자 |
| Visualization | 2×6 grid (desktop) / 2×6 stack (mobile 360px), weight=0 카테고리(BR)는 dim opacity 0.5 |
| 인터랙션 | hover → tooltip with finding count, click → FindingsList filter 적용 |

### C.7 §7 FindingsList — filter + sort

| 항목 | 명세 |
|---|---|
| Data source | `run.findings: Finding[]` |
| UI component | `FindingsList` (기존 enhance) |
| Filters | category (12 multi-select) / severity (P0~P3 multi) / confidence (3 multi) / status (open/resolved) |
| Sort | impact (default) / severity / category / file path |
| i18n keys | reuse existing |
| Length cap | message ≤ 200자 (truncate utility A.4.2) |
| Visualization | virtualized list (react-virtual), max 500 visible |
| Empty state | "필터에 해당하는 findings 없음" |

### C.8 §8 CoverageMatrix — claim × checklist cross-table

| 항목 | 명세 |
|---|---|
| Data source | `run.coverageMatrix: ClaimCoverage[]` |
| UI component | `CoverageMatrix` (W2-B 완성판) |
| Cell | claim_id × checklist_id 교차, status badge (PASS/FAIL/PARTIAL/UNKNOWN) |
| i18n keys | `coverage.status.{state}.label` × 4 × 2 lang + claim/checklist labels |
| Length cap | claim text ≤ 100자 (truncate A.4.2) |
| Visualization | sticky header + horizontal scroll hint on mobile |
| primaryPath | A.4.3 fallback 적용 |

### C.9 §9 EvidencePanel — collapse persist (L-P1-4)

| 항목 | 명세 |
|---|---|
| Data source | `finding.evidences: Evidence[]` |
| UI component | `EvidencePanel` (enhance with localStorage) |
| Collapse key | `cts.evidence.collapsed.{ruleId}` |
| i18n keys | reuse existing |
| Length cap | snippet ≤ 300자 |
| Visualization | code block (mono font), line highlight, file path → click 복사 |
| SSR | hydration mismatch 방지: 초기 render는 expanded, 클라이언트 mount 후 localStorage 적용 |

### C.10 §10 RunMetadata — bottom strip

| 항목 | 명세 |
|---|---|
| Data source | `run.metadata: { startedAt, finishedAt, profile, auditCoreVersion, pipelineVersion }` |
| UI component | `RunMetadataStrip` (apps/web/components/run-metadata-strip.tsx) |
| 표시 | startedAt (relative + absolute) / duration / profile badge / version pill |
| i18n keys | `metadata.startedAt.label` / `.duration.label` / `.profile.label` / `.version.label` × 2 lang |
| Length cap | N/A (메타데이터) |
| Visualization | 1-line strip, 12px text, 하단 고정 |
| 용도 | 신뢰성 (언제 / 어느 버전으로 분석했는지) |

### C.11 신규 i18n 키 총합

| 블록 | 신규 키 수 (per lang) |
|---|---|
| §1 ShipVerdict | 42 |
| §2 FCS | 10 |
| §3 Narrative | ~340 |
| §4 TopConcerns | 0 (reuse) |
| §5 Next 30min | ~85 |
| §6 CategoryGrid | 12 |
| §7 FindingsList | 0 (reuse) |
| §8 CoverageMatrix | 4 |
| §9 EvidencePanel | 0 (reuse) |
| §10 RunMetadata | 4 |
| **합계** | **~497 키 × 2 lang = ~994 entries** |

**작업 분담**: Narrative 키 ~340 × 2는 별도 i18n 챕터로 분리 (content-marketer 에이전트 위임 가능, Wave 2 병행).

### C.12 Visualization 통합 디자인 토큰

| Token | Value | 용도 |
|---|---|---|
| `--cts-severity-p0` | #DC2626 | P0 border, badge |
| `--cts-severity-p1` | #EA580C | P1 |
| `--cts-severity-p2` | #CA8A04 | P2 |
| `--cts-severity-p3` | #65A30D | P3 |
| `--cts-status-ready` | #16A34A | READY |
| `--cts-status-blocked` | #991B1B | BLOCKED |
| `--cts-fcs-uncertainty-alpha` | 0.3 | bar overlay opacity |
| `--cts-narrative-line-height` | 1.6 | Narrative 가독성 |

---

## §D. 실행 로드맵 — 5-Wave (총 16.5d)

### D.0 전체 일정 (2026-05-19 ~ 2026-06-05, 18 캘린더일 / 16.5 effective day)

| Wave | 기간 | Effort | 주제 | Verification |
|---|---|---|---|---|
| Wave 0 | 2026-05-18 (DONE) | 0.5d | §A 본 PRD 작성 | docs/PRD/ 파일 존재, 600+ line |
| Wave 1 | 2026-05-19 ~ 2026-05-20 | 2d | FCS 구현 (Option 1) | fcs/compute-fcs.test.ts PASS + UI snapshot |
| Wave 2 | 2026-05-21 ~ 2026-05-25 | 5d | Insight Reorg 10-block | apps/web 페이지 e2e + 1700+ tests PASS |
| Wave 3 | 2026-05-26 ~ 2026-05-30 | 5d | P1 (5건) + W2-A impl + T3.0 vibe profile | acceptance per item + 1750+ PASS |
| Wave 4 | 2026-06-01 ~ 2026-06-02 | 1.5d | Phase 4.5 cleanup (4건) + L-P1-2 demoted | 1755+ PASS + visual regression baseline |
| Wave 5 | 2026-06-03 ~ 2026-06-05 | 3d | Pre-launch QA + content + marketing + go-live | 모든 AC 통과, manual smoke ✓, deploy |

### D.1 Wave 1 — FCS (2d)

| Sub-task | Effort | Owner | Deliverable | Verification |
|---|---|---|---|---|
| W1.1 | 0.25d | backend-developer | `packages/shared-types/src/fcs.ts` FCSResult type | `pnpm --filter @cts/shared-types test` PASS |
| W1.2 | 0.75d | backend-developer | `packages/audit-core/src/fcs/compute-fcs.ts` | unit + property test, 12+ cases |
| W1.3 | 0.25d | backend-developer | calculate-scores 통합 (output에 fcs 필드 포함) | weight invariant=100 여전히 PASS |
| W1.4 | 0.5d | frontend-developer | `apps/web/components/founder-confidence-score.tsx` | snapshot + a11y (axe) + 360px |
| W1.5 | 0.25d | code-reviewer | 코드 리뷰 + audit-core SSOT 검증 | review approval |

**Dependencies**: 없음 (Wave 0 완료 후 즉시 시작)
**Risk**: uncertainty 공식 cap. **Mitigation**: property test로 monotonicity 검증.
**Verification command**: `pnpm test --filter @cts/audit-core --filter @cts/shared-types`

### D.2 Wave 2 — Insight Reorganization (5d)

| Sub-task | Effort | Owner | Deliverable | Verification |
|---|---|---|---|---|
| W2.1 | 1.5d | frontend-developer | Narrative (§3) + i18n ~340 키 | snapshot + storybook + a11y |
| W2.2 | 1d | frontend-developer | Next30MinChecklist (§5) + localStorage | e2e: 체크/언체크/persist |
| W2.3 | 0.75d | frontend-developer | CategoryGrid (§6) + tie-break | snapshot + tooltip + 360px |
| W2.4 | 0.5d | frontend-developer | RunMetadataStrip (§10) | snapshot |
| W2.5 | 0.5d | frontend-developer | ShipVerdictBanner 7-enum (§1 enhance) | 7 variants visual |
| W2.6 | 0.5d | frontend-developer | Skeleton (L-P1-6) + Suspense | perf budget < 100ms TTI gain |
| W2.7 | 0.25d | code-reviewer | 페이지 통합 리뷰 | review approval |

**Dependencies**: Wave 1 (FCS) 완료
**Risk**: i18n 키 ~994 entries 폭증. **Mitigation**: content-marketer 에이전트 병행 위임, 영문은 자동 번역 초안 → 검수.
**Verification command**: `pnpm test && pnpm --filter @cts/web test:e2e`

### D.3 Wave 3 — P1 + W2-A + T3.0 (5d)

| Sub-task | Effort | Owner | Deliverable | Verification |
|---|---|---|---|---|
| W3.1 | 1.5d | frontend+backend | W2-A PRD upload impl (PRD: w2a-prd-upload.md) | AC1~AC9 |
| W3.2 | 1d | backend-developer | T3.0 vibe-coded profile detector | 30+ fixtures + e2e |
| W3.3 | 0.25d | frontend-developer | L-P1-1 ProfileBadge i18n (en 보강) | snapshot |
| W3.4 | 0.5d | frontend-developer | L-P1-5 ko/en toggle 즉시 반영 | visual regression |
| W3.5 | 1d | frontend-developer | W2-B CoverageMatrix UI 완성 (§8) | sticky header + scroll hint |
| W3.6 | 0.25d | code-reviewer | 통합 리뷰 | review approval |
| W3.7 | 0.5d | tdd-guide | 신규 e2e 6+ cases | all PASS |

**Dependencies**: Wave 2 완료
**Risk**: W2-A PrdTextTooLargeError 422 vs PerIpRateLimitError 429 status code 충돌. **Mitigation**: error mapping 매트릭스 사전 검증.
**Verification command**: `pnpm test && pnpm --filter @cts/web test:e2e`

### D.4 Wave 4 — Phase 4.5 Cleanup (1.5d)

| Sub-task | Effort | Owner | Deliverable | Verification |
|---|---|---|---|---|
| W4.1 | 0.5d | backend-developer | A.4.1 ghostButtonHeuristicForced fix | profiles/index.test.ts PASS |
| W4.2 | 0.25d | backend-developer | A.4.2 truncate utility | utils/truncate.test.ts PASS |
| W4.3 | 0.25d | backend-developer | A.4.3 primaryPath fallback | coverage-matrix.test.ts PASS |
| W4.4 | 0.5d | backend-developer | A.4.4 BUSINESS_READINESS tie-break | calculate-scores.test.ts snapshot |
| W4.5 | 0.5d | frontend-developer | L-P1-4 EvidencePanel collapse persist | e2e refresh test |
| W4.6 | 0.5d | tdd-guide | L-P1-7 mobile 360px visual baseline | Playwright visual diff |
| W4.7 | 0.5d | backend-developer | L-P1-2 feature-graph adapter test (demoted P2이지만 묶음) | 4+ test cases |

**Dependencies**: Wave 3 완료
**Risk**: 묶음 시 회귀 위험. **Mitigation**: 각 sub-task 후 full test run 필수 (memory rule: feedback_full_test_run.md).
**Verification command**: `pnpm test` (전체)

### D.5 Wave 5 — Pre-Launch QA + Marketing (3d)

| Sub-task | Effort | Owner | Deliverable | Verification |
|---|---|---|---|---|
| W5.1 | 0.5d | tdd-guide + e2e-runner | Full smoke (12 profile × 7 status × 3 lang) | 모든 케이스 visual + functional |
| W5.2 | 0.5d | security-reviewer | DATA POLICY 최종 audit | "no external code transmission" 검증 |
| W5.3 | 0.5d | seo-specialist | meta/OG/twitter card (appendix B 기반) | Lighthouse SEO 95+ |
| W5.4 | 0.25d | content-marketer | hero copy / 첫 페이지 카피 final | legal review |
| W5.5 | 0.5d | cro-specialist | 첫 페이지 CTA + funnel | A/B test setup |
| W5.6 | 0.25d | devops-engineer | production deploy | Cloud Run health check ✓ |
| W5.7 | 0.5d | ad-specialist | go-live announcement (Twitter/HN) | scheduled |

**Dependencies**: Wave 4 완료
**Risk**: legal review에서 "유일한" 표현 reject. **Mitigation**: appendix B 가이드 사전 적용 + 대체 표현 준비.
**Verification command**: `pnpm build && pnpm --filter @cts/web start` (production-like) + manual smoke

### D.6 신규 DoD 항목 (Wave 5 종료 시 모두 PASS 필수)

| ID | 항목 | 측정 |
|---|---|---|
| D4 | FCS 점수 변동 시 Δ narrative 표시 | snapshot |
| D5 | Next 30min checklist persist (localStorage) | e2e |
| D6 | CategoryGrid weight=0 카테고리 dim 표시 | visual |
| U7 | Narrative 3-sentence template ko/en 모두 자연어 통과 | manual review |
| U8 | Mobile 360px 모든 10 블록 정렬 | Playwright visual baseline |
| U9 | FCS uncertainty bar a11y aria-* 통과 | axe 0 critical |

### D.7 위험 종합 매트릭스

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | FCS uncertainty 공식 임의성 비판 | M | M | property test + 사용자 docs 명시 |
| R-2 | i18n ~994 entries 폭증 → 번역 누락 | M | H | content-marketer 병행, lint script로 missing key 감지 |
| R-3 | W2-A 422/429 status 충돌 | L | M | error matrix 사전 검증 |
| R-4 | T3.0 vibe-coded detector false positive | M | M | 30+ fixture + opt-out 옵션 |
| R-5 | Wave 4 4건 묶음 회귀 | L | H | 각 sub-task 후 full test run (feedback_full_test_run.md 준수) |
| R-6 | Legal "유일한" reject | M | L | 대체 카피 준비 |
| R-7 | Launch day Cloud Run cold start | L | M | min-instance=1 사전 설정 |
| R-8 | i18n hydration mismatch (L-P1-5) | M | M | revalidatePath + suppressHydrationWarning 명시 |

### D.8 Dependencies Graph

```
Wave 0 (DONE)
    ↓
Wave 1 (FCS) ─────────┐
    ↓                  │
Wave 2 (Insight) ←─────┘
    ↓
Wave 3 (P1 + W2-A + T3.0)
    ↓
Wave 4 (Cleanup)
    ↓
Wave 5 (Launch)
```

병렬화 기회: Wave 2의 W2.1 Narrative i18n 작업은 Wave 1과 부분 병렬 가능 (i18n 키 정의 부분만).

---

## §E. 본 PRD ↔ Base PRD 매핑

| Base PRD §  | 본 PRD § | 변화 |
|---|---|---|
| §1 Context Packet | §A.1 | 1579 PASS baseline 갱신 |
| §2 USP-1/2/3 | §B | USP 3옵션을 명시 평가, FCS=1순위 결정 |
| §3.3 7-block stack | §C | 10-block으로 확장, FCS hero 신규 |
| §4 P0-P2 todos | §A.2, §A.3, §A.4 | P1 7건 재평가 + Phase 4.5 follow-up 신규 |
| §5 Sprint plan | §D | 5-Wave 16.5d, launch 2026-06-05 (9d 단축) |
| §6 DoD | §D.6 | D4/D5/D6/U7/U8/U9 6건 신규 추가 |

---

## §F. Appendix 매핑

- **Appendix A (wireframes)**: §1 ShipVerdict 5 mockup + 모바일 변형, §2 FCS gauge mockup은 본 PRD에서 신규 정의 (Wave 1 시작 시 wireframe 보강 필요)
- **Appendix B (copywriting)**: §1/§2/§3 모든 카피의 tone guide 준수, "유일한" 표현 가드, hero 3안 → 1안 선정 Wave 5
- **Appendix C (coverage matrix)**: §8 CoverageMatrix가 본 spec 직접 구현, primaryPath fallback A.4.3 적용
- **Appendix D (action-hint dictionary)**: §4 TopConcerns + §5 Next 30min 모두 42-entry dict 사용

---

## §G. Phase 1 PLAN 핸드오프를 위한 핵심 결정 6건

| # | 결정 | 근거 |
|---|---|---|
| G1 | FCS를 1순위 sharper core로 채택 | §B.4 weighted score 9.05/10, No-LLM + 2d effort |
| G2 | Insight stack을 7→10 block으로 확장 | "핵심을 찌르는 결정 가독성" 충족, §C 전체 |
| G3 | L-P1-3 Narrative를 P0로 승격 | §A.2, sharper core 직결 |
| G4 | L-P1-2 feature-graph test를 P2 강등 | §A.2, 사용자 비가시 + 회귀 없음 |
| G5 | Launch target 2026-06-05 (9d 단축) | §D.0, P0 6/7 완료로 가속 가능 |
| G6 | Phase 4.5 4건을 Wave 4 묶음 | §A.4, 각 0.25~0.5d로 독립 수행 가능 |

---

## §H. References

- Base PRD: `cleartoship/docs/PRD/finalize-launch-2026-05-18.md` (544 lines)
- W2-A PRD: `cleartoship/docs/PRD/w2a-prd-upload.md` (Task #5 산출물)
- Appendix A~D: `cleartoship/docs/PRD/appendix-{A,B,C,D}-*.md`
- ROADMAP: `cleartoship/docs/ROADMAP.md`
- Memory rules (active): feedback_review_model.md, feedback_six_layer_drill.md, feedback_full_test_run.md, feedback_audit_core_ssot.md
- Project memory (active): project_severity_enum.md, project_audit_pipeline.md, project_audit_categories.md, project_audit_profiles.md, project_session_2026_05_17.md
- Code anchors verified:
  - `packages/shared-types/src/domain.ts:107` (`prdText: z.string().nullable()`)
  - `packages/audit-core/src/calculate-scores.test.ts:16` (weight invariant=100)
  - `packages/audit-core/src/profiles/index.test.ts` (ghostButtonHeuristicForced ref)
  - `packages/audit-core/src/coverage-matrix.ts` (truncate / primaryPath issues)

---

**END OF PRD — 본 문서는 design-only이며 코드 변경을 포함하지 않습니다. Phase 1 PLAN 단계에서 G1~G6 6 결정을 입력으로 sub-task 분해 진행.**
