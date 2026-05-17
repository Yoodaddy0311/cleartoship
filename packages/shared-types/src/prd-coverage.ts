import { z } from 'zod';

/** PRD에서 추출한 단일 기능 단위. */
export const PrdFeatureCategory = z.enum([
  'page', 'api', 'flow', 'data', 'integration', 'auth', 'other',
]);
export type PrdFeatureCategory = z.infer<typeof PrdFeatureCategory>;

export const PrdFeaturePriority = z.enum(['must', 'should', 'could']);
export type PrdFeaturePriority = z.infer<typeof PrdFeaturePriority>;

export const PrdFeatureSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: PrdFeatureCategory,
  description: z.string(),
  acceptanceCues: z.array(z.string()).default([]),
  priority: PrdFeaturePriority,
  sourceSpan: z.object({ startChar: z.number().int(), endChar: z.number().int() }).nullable(),
});
export type PrdFeature = z.infer<typeof PrdFeatureSchema>;

/** 매칭 결과 단일. */
export const PrdMatchStatus = z.enum(['implemented', 'partial', 'missing']);
export type PrdMatchStatus = z.infer<typeof PrdMatchStatus>;

export const PrdFeatureMatchSchema = z.object({
  feature: PrdFeatureSchema,
  status: PrdMatchStatus,
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  evidence: z.array(z.object({
    path: z.string(),
    lineStart: z.number().int().nullable(),
    lineEnd: z.number().int().nullable(),
    snippet: z.string().nullable(),
  })).default([]),
  rationale: z.string(),
});
export type PrdFeatureMatch = z.infer<typeof PrdFeatureMatchSchema>;

/** PRD에는 없는데 코드에 있는 항목 (over-build). */
export const SpuriousArtifactSchema = z.object({
  artifactType: z.enum(['page', 'api', 'component', 'data_model']),
  path: z.string(),
  label: z.string(),
  rationale: z.string(),
});
export type SpuriousArtifact = z.infer<typeof SpuriousArtifactSchema>;

/** 전체 커버리지 리포트. */
export const PrdCoverageReportSchema = z.object({
  totalFeatures: z.number().int().nonnegative(),
  matched: z.array(PrdFeatureMatchSchema),
  partial: z.array(PrdFeatureMatchSchema),
  missing: z.array(PrdFeatureMatchSchema),
  spurious: z.array(SpuriousArtifactSchema),
  coverageScore: z.number().min(0).max(100),
  generatedAt: z.string(),
  model: z.string().nullable(),
});
export type PrdCoverageReport = z.infer<typeof PrdCoverageReportSchema>;

/** 한국어 라벨. */
export const PRD_MATCH_STATUS_LABELS_KO: Record<PrdMatchStatus, { label: string; description: string }> = {
  implemented: { label: '구현 완료', description: 'PRD 의 기능이 코드에 있어요' },
  partial: { label: '부분 구현', description: 'UI 만 있거나 API 만 있는 등 일부만 만들어졌어요' },
  missing: { label: '미구현', description: 'PRD 에 적혀있지만 코드에서 찾지 못했어요' },
};

export const PRD_FEATURE_CATEGORY_LABELS_KO: Record<PrdFeatureCategory, string> = {
  page: '화면', api: 'API', flow: '흐름', data: '데이터',
  integration: '외부 연동', auth: '인증', other: '기타',
};
