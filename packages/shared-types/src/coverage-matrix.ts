// L-P0-6 / L-P0-5 — PRD Coverage Matrix schema (USP-2 차별점의 산출 자료형).
//
// 사용자가 W2-A 로 업로드한 PRD claim 을 W1-A measuredBy detector 결과 +
// W1-B 80 ID 매핑과 cross-reference 한 1:1 매트릭스. Sprint 3 L-P0-5 에서
// `buildCoverageMatrix(claims, detectors, findings, hasLLM)` 가 entry 들을
// 채워 `AuditReport.coverageMatrix` 에 첨부한다.
//
// 위치는 `appendix-C-coverage-matrix-spec.md` §C.7.1 SSOT 권장 위치
// (`packages/shared-types/src/coverage-matrix.ts`) 를 그대로 따른다.

import { z } from 'zod';

/**
 * Coverage Matrix 의 단일 row 충족 판정 상태.
 *
 * - `fulfilled` (✅): detector 매칭 성공 AND blocking finding (P0/P1) 0건
 * - `partial`   (⚠️): detector 매칭 + blocking finding ≥1 — 또는 LLM fuzzy
 *                    match confidence ≥ 0.6
 * - `unclear`   (❓): detector 매칭 실패 AND (LLM 미사용 OR LLM confidence <0.6)
 */
export const CoverageStatusSchema = z.enum(['fulfilled', 'partial', 'unclear']);
export type CoverageStatus = z.infer<typeof CoverageStatusSchema>;

/**
 * Coverage Matrix 의 evidence 항목. discriminated union 으로 source 별
 * 필드 셋이 분리된다.
 *
 * - `file`: detector 가 1차 매칭한 파일 경로
 * - `finding`: blocking finding 의 id (cross-ref 로 detail 페이지 jump)
 * - `llm`: LLM fuzzy match 결과 (T3.3 도입 후) — confidence 만 기록
 */
export const CoverageEvidenceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('file'), path: z.string().min(1) }),
  z.object({ type: z.literal('finding'), findingId: z.string().min(1) }),
  z.object({ type: z.literal('llm'), confidence: z.number().min(0).max(1) }),
]);
export type CoverageEvidence = z.infer<typeof CoverageEvidenceSchema>;

/**
 * 매트릭스 한 행. `recommendation` 은 ✅ fulfilled 일 때 생략(`undefined`)
 * 되고 ⚠️/❓ 일 때만 채워진다. `confidence` 는 판정 자체의 신뢰도
 * (heuristic claim parsing 의 confidence 가 그대로 전파될 수 있음).
 */
export const CoverageMatrixEntrySchema = z.object({
  claim: z.string().min(1).max(500),
  status: CoverageStatusSchema,
  evidence: z.array(CoverageEvidenceSchema).default([]),
  recommendation: z.string().max(500).optional(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
});
export type CoverageMatrixEntry = z.infer<typeof CoverageMatrixEntrySchema>;
