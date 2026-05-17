# Appendix C: Coverage Matrix Spec — PRD 클레임 vs 구현 증거 1:1 매칭

**작성일**: 2026-05-18
**작성자**: planner / Claude (Opus 4.7) — design-only
**상위 PRD**: [finalize-launch-2026-05-18.md](./finalize-launch-2026-05-18.md)
**참조 섹션**: §2 USP-2 PRD-aware + §3.3 와이어프레임 §2 + §6.4 D2
**목적**: USP-2의 핵심 산출물 — PRD 클레임을 코드 evidence와 1:1로 매칭하는 Coverage Matrix의 SSOT

---

## §C.1 목적

ClearToShip의 USP-2 "PRD-aware Audit" 차별점을 실제 리포트 산출물로 구현한다. 사용자가 W2-A로 업로드한 PRD를 step 5 `ANALYZE_PRD`가 파싱하여 추출한 claim 목록을, W1-A `measuredBy` detector 결과 및 W1-B 80 ID 매핑과 cross-reference 하여 1:1 매트릭스를 생성한다. **결과적으로 리포트는 "PRD에 적은 기능이 코드에 실제로 있는가?"라는 단일 질문에 표 한 장으로 답한다.**

경쟁 도구(SonarQube, Snyk, Lighthouse, CodeQL) 어느 것도 PRD 인지 진단을 제공하지 않으므로, Coverage Matrix는 ClearToShip의 가장 강력한 marketing differentiator이자 product differentiator다.

---

## §C.2 데이터 소스

| 데이터 | 소스 함수/필드 | 절대 경로 (read-only) |
|---|---|---|
| PRD 원본 텍스트 | `auditRun.prdText` (W2-A) | `packages/shared-types/src/api.ts` — `CreateAuditRunRequestSchema.prdText` |
| PRD claim 배열 | `pipelineState.prdClaims[]` | `packages/audit-worker/src/steps/05-analyze-prd.ts` (예상 위치) |
| W1-A measuredBy 결과 | `pipelineState.detectorResults[].measuredBy` | `packages/audit-core/src/detectors/` |
| W1-B 80 ID 매핑 | `pipelineState.checklistMappings[]` | `packages/audit-core/src/checklist/` |
| Finding 목록 | `findings[]` (severity/relatedFeature/evidence) | `packages/shared-types/src/domain.ts` — `FindingSchema` |
| LLM fuzzy match (Phase 3) | `llmAdapter.fuzzyMatchClaim()` | T3.3 미구현 — fallback to "❓ 불명확" |

**입력 contract**: 매트릭스 생성 시점에 위 6개 소스는 모두 in-memory에 존재 (step 5 → step 16~17 사이 임의 시점). step 18 GENERATE_REPORT 직전에 호출이 표준.

---

## §C.3 출력 포맷 (리포트 §2 위치)

리포트 본문 §2에 다음 GFM 표를 렌더링한다. 정렬자를 명시한다.

```markdown
## §2 PRD Coverage Matrix

| Claim                                | Status | Evidence              | Recommendation              |
| :----------------------------------- | :----: | :-------------------- | :-------------------------- |
| 이메일/비밀번호 회원가입            |   ✅   | `auth/signup.tsx`     | —                           |
| Google OAuth 로그인                  |   ⚠️   | `auth/oauth.tsx` +    | redirect_uri whitelist 추가 |
|                                      |        | `CC-SEC-006`          |                             |
| Stripe 결제                          |   ❓   | (detect 안 됨)        | 결제 통합 또는 PRD 수정     |
```

**컬럼 명세**

| 컬럼 | 데이터 | 길이 제약 | 표시 규칙 |
|---|---|---|---|
| Claim | 추출된 claim 텍스트 | max 80자 | 초과 시 ellipsis(`…`) |
| Status | 충족 판정 | 1개 이모지 + 한국어 | ✅ 충족 / ⚠️ 미흡 / ❓ 불명확 |
| Evidence | 파일 경로 또는 finding ID | 줄당 max 60자 | 다중 evidence는 + 로 연결, 줄바꿈 OK |
| Recommendation | 권장 조치 1문장 | max 100자 | Status가 ✅이면 `—` |

**요약 라인** (표 직전 또는 직후):

```
PRD 클레임 10건 중 ✅ 충족 6 / ⚠️ 미흡 2 / ❓ 불명확 2 (충족률 60%)
```

---

## §C.4 샘플 PRD → 샘플 Coverage Matrix

### §C.4.1 가상 PRD 입력 (10 claim)

```
SaaS PRD v1.0
=============
- 사용자는 이메일과 비밀번호로 회원가입할 수 있어야 한다.
- Google OAuth 로그인을 지원한다.
- Stripe로 월구독 결제를 처리한다.
- Algolia를 통한 검색 기능을 제공한다.
- 한국어 / 영어 다국어 지원.
- 다크모드 토글 제공.
- 사용자 프로필 페이지 제공.
- 결제/배송 등 주요 이벤트 시 이메일 알림.
- 관리자 전용 대시보드.
- 모바일 반응형 디자인.
```

### §C.4.2 출력 Coverage Matrix

| Claim | Status | Evidence | Recommendation |
| :---- | :----: | :------- | :------------- |
| 이메일/비밀번호 회원가입 | ✅ | `auth/signup.tsx` | — |
| Google OAuth 로그인 | ⚠️ | `auth/oauth.tsx` + `CC-SEC-006` | redirect_uri whitelist 적용 |
| Stripe 월구독 결제 | ❓ | (detect 안 됨) | 결제 통합 구현 또는 PRD에서 제거 |
| Algolia 검색 | ✅ | `lib/search/algolia.ts` | — |
| 한국어/영어 다국어 | ⚠️ | `i18n/ko.ts` (en.ts scaffold만) | `i18n/en.ts` 완성 + 라우트 스위치 |
| 다크모드 토글 | ❓ | (detect 안 됨) | next-themes 도입 또는 PRD 제거 |
| 프로필 페이지 | ✅ | `app/profile/page.tsx` | — |
| 이메일 알림 (SendGrid) | ⚠️ | `lib/email/sendgrid.ts` + `CC-COMM-002` | unsubscribe 링크 추가 |
| 관리자 대시보드 | ❓ | (detect 안 됨, `/admin` 라우트 없음) | 관리자 라우트 구현 필요 |
| 모바일 반응형 | ✅ | lighthouse-mobile score=87 | — |

**요약**: PRD 10건 중 ✅ 4 / ⚠️ 3 / ❓ 3 (충족률 40%)

---

## §C.5 Claim 상태 판정 알고리즘

### §C.5.1 의사코드 (TypeScript)

```typescript
type Status = 'fulfilled' | 'partial' | 'unclear'

function determineClaimStatus(
  claim: PrdClaim,
  detectorResults: DetectorResult[],
  findings: Finding[],
  hasLLM: boolean,
): { status: Status; evidence: Evidence[]; recommendation?: string } {
  // 1) detector 매칭 시도
  const matched = detectorResults.find(d =>
    d.measuredBy.some(m => isFeatureMatch(m, claim.featureKey))
  )

  // 2) detector 매칭 실패
  if (!matched) {
    if (hasLLM) {
      const llmResult = llmAdapter.fuzzyMatchClaim(claim, detectorResults)
      if (llmResult.confidence >= 0.6) {
        return {
          status: 'partial',
          evidence: [{ type: 'llm', confidence: llmResult.confidence }],
          recommendation: `LLM 판정: ${llmResult.suggestion}`,
        }
      }
    }
    return {
      status: 'unclear',
      evidence: [],
      recommendation: '구현 또는 PRD 수정',
    }
  }

  // 3) detector 매칭 성공 → blocking finding 확인
  const blockingFindings = findings.filter(f =>
    (f.severity === 'P0' || f.severity === 'P1') &&
    f.relatedFeature === claim.featureKey
  )

  if (blockingFindings.length === 0) {
    return {
      status: 'fulfilled',
      evidence: [{ type: 'file', path: matched.primaryPath }],
    }
  }

  return {
    status: 'partial',
    evidence: [
      { type: 'file', path: matched.primaryPath },
      ...blockingFindings.map(f => ({ type: 'finding' as const, findingId: f.id })),
    ],
    recommendation: composeRecommendation(blockingFindings[0]),
  }
}
```

### §C.5.2 Status 판정 조건 표

| Status | 이모지 | Trigger 조건 |
|---|:---:|---|
| `fulfilled` | ✅ 충족 | detector 매칭 ✅ AND blocking finding (P0/P1) 0건 |
| `partial` | ⚠️ 미흡 | detector 매칭 ✅ AND blocking finding ≥1건 — 또는 — LLM fuzzy match confidence ≥0.6 |
| `unclear` | ❓ 불명확 | detector 매칭 ❌ AND (LLM 미사용 OR LLM confidence <0.6) |

### §C.5.3 `composeRecommendation` 규칙

가장 심각한 blocking finding의 `ruleFamily` → `appendix-D-action-hint-dictionary.md`의 `actionHint.text`를 그대로 사용 (DRY, SSOT).

---

## §C.6 Edge Case 처리

| Edge Case | 처리 정책 |
|---|---|
| **PRD 200KB cap 초과** | 서버 safety net (`CreateAuditRunRequestSchema.prdText.max(200_000)`) — 422 reject. UI에 "PRD 200KB 초과 — 핵심 섹션만 발췌하여 다시 업로드해주세요" 안내 |
| **PRD 50KB cap 초과** | `PrdTextTooLargeError` (W2-A, 422 + `{maxBytes, actualBytes}`) |
| **PRD 0 claim 추출** | Coverage Matrix 섹션 자체 생략. 리포트 §2 위치에 footnote만: "업로드된 PRD에서 검증 가능한 claim을 찾지 못했습니다. (claim 후보가 너무 짧거나 비정형일 수 있습니다)" |
| **비PRD 텍스트 (이력서, 소설 등)** | claim parser heuristic — (1) 명령형/요구형 동사 비율 <10% AND (2) 구체적 feature 키워드 <3건이면 confidence LOW 표시. 리포트 §2 상단 warning 배너: "이 문서는 PRD 형식이 아닐 수 있습니다. 추출 결과를 검토해주세요" |
| **claim 100건 초과** | 표는 상위 50건만 렌더링 + footnote: "claim 100건 중 50건 표시. 전체는 JSON export 참조" |
| **동일 claim 중복** | normalize key (소문자, 공백 제거)로 dedup, 첫 occurrence만 표시 |
| **PRD 없음 (deployUrl만)** | Coverage Matrix 섹션 생략. 리포트 §2 자리에 "PRD 업로드 시 Coverage Matrix 자동 생성 → [업로드하러 가기]" CTA |

---

## §C.7 Schema 변경

### §C.7.1 zod schema (신규 또는 확장)

**위치**: `packages/shared-types/src/coverage-matrix.ts` (신규 권장)

```typescript
import { z } from 'zod';

export const CoverageStatusSchema = z.enum(['fulfilled', 'partial', 'unclear']);
export type CoverageStatus = z.infer<typeof CoverageStatusSchema>;

export const CoverageEvidenceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('file'), path: z.string().min(1) }),
  z.object({ type: z.literal('finding'), findingId: z.string().min(1) }),
  z.object({ type: z.literal('llm'), confidence: z.number().min(0).max(1) }),
]);
export type CoverageEvidence = z.infer<typeof CoverageEvidenceSchema>;

export const CoverageMatrixEntrySchema = z.object({
  claim: z.string().max(500),
  status: CoverageStatusSchema,
  evidence: z.array(CoverageEvidenceSchema).default([]),
  recommendation: z.string().max(500).optional(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
});
export type CoverageMatrixEntry = z.infer<typeof CoverageMatrixEntrySchema>;

export const CoverageMatrixSchema = z.object({
  entries: z.array(CoverageMatrixEntrySchema),
  summary: z.object({
    total: z.number().int().min(0),
    fulfilled: z.number().int().min(0),
    partial: z.number().int().min(0),
    unclear: z.number().int().min(0),
    fulfillmentRate: z.number().min(0).max(1),
  }),
  truncated: z.boolean().default(false),
});
export type CoverageMatrix = z.infer<typeof CoverageMatrixSchema>;
```

### §C.7.2 AuditReportSchema 확장

```typescript
// packages/shared-types/src/domain.ts (기존 AuditReportSchema 확장)
import { CoverageMatrixSchema } from './coverage-matrix.js';

export const AuditReportSchema = z.object({
  // ...기존 필드 그대로...
  coverageMatrix: CoverageMatrixSchema.optional(),  // ← 신규
});
```

**Optional 필드**로 추가하여 기존 reports/clients 무영향. PRD 미업로드 run에서는 `undefined`.

### §C.7.3 검증 정책 (feedback_full_test_run.md 준수)

schema 변경 시 다음 3종을 모두 재실행:

1. `packages/shared-types` — 단위 테스트 (zod parsing)
2. `packages/audit-core` — render-markdown, scoring 통합 테스트
3. `workers/audit-worker` — step 18 GENERATE_REPORT 통합 테스트

**Isolated 테스트는 TDZ를 가린다** — 한 곳만 PASS여도 다른 곳에서 enum 순서나 import 순환이 깨질 수 있음. 3종 한꺼번에 돌릴 것.

---

## §C.8 구현 위치 (실제 코드 변경 시점)

**현재 단계 (design-only)에서는 코드 변경 없음.** 향후 Sprint 3 L-P0-5 작업 시:

| 파일 | 변경 | 책임 |
|---|---|---|
| `packages/shared-types/src/coverage-matrix.ts` | 신규 (위 zod schema) | typescript-pro |
| `packages/shared-types/src/domain.ts` | `AuditReportSchema.coverageMatrix` 필드 추가 | typescript-pro |
| `packages/audit-core/src/coverage-matrix-builder.ts` | 신규 — `buildCoverageMatrix(claims, detectors, findings, hasLLM)` | backend-developer |
| `packages/audit-core/src/render-markdown.ts` | §2 PRD Coverage Matrix 섹션 렌더링 함수 추가 | backend-developer |
| `workers/audit-worker/src/steps/18-generate-report.ts` | `buildCoverageMatrix()` 호출 → `report.coverageMatrix` 저장 | backend-developer |
| `apps/web/components/reports/coverage-matrix-table.tsx` | 신규 UI 컴포넌트 (HTML 렌더, sortable) | frontend-developer |

테스트:
- `packages/shared-types/__tests__/coverage-matrix.test.ts` — schema parsing/validation
- `packages/audit-core/__tests__/coverage-matrix-builder.test.ts` — 알고리즘 3 상태 분기 + LLM fuzzy match mock + edge case 6종
- `workers/audit-worker/__tests__/steps/18-generate-report.test.ts` — coverageMatrix 통합 흐름
- `apps/web/__tests__/components/coverage-matrix-table.test.tsx` — rendering

---

## §C.9 변경 이력

| 날짜 | 변경 | 작성자 |
|---|---|---|
| 2026-05-18 | 최초 작성 — 목적/데이터 소스/포맷/샘플 10 claim/판정 알고리즘/edge case 6종/zod schema/구현 위치 | planner / Claude (Opus 4.7) |
