// PRD coverage schema tests — verifies valid/invalid parsing for every schema
// and that the Korean label maps cover every enum literal (no `undefined`
// labels rendered in the UI).

import { describe, it, expect } from 'vitest';
import {
  PRD_FEATURE_CATEGORY_LABELS_KO,
  PRD_MATCH_STATUS_LABELS_KO,
  PrdCoverageReportSchema,
  PrdFeatureCategory,
  PrdFeatureMatchSchema,
  PrdFeaturePriority,
  PrdFeatureSchema,
  PrdMatchStatus,
  SpuriousArtifactSchema,
} from './prd-coverage.js';

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;
type AssertEqual<X, Y> = Equal<X, Y>;

const ISO = '2026-05-17T10:00:00.000Z';

function baseFeature(over: Record<string, unknown> = {}) {
  return {
    id: 'feat-login',
    name: '로그인',
    category: 'auth',
    description: '이메일/비밀번호 로그인 기능',
    acceptanceCues: ['이메일 입력', '비밀번호 입력', '로그인 버튼 클릭'],
    priority: 'must',
    sourceSpan: { startChar: 0, endChar: 120 },
    ...over,
  };
}

function baseFeatureMatch(over: Record<string, unknown> = {}) {
  return {
    feature: baseFeature(),
    status: 'implemented',
    confidence: 'HIGH',
    evidence: [
      {
        path: 'apps/web/app/login/page.tsx',
        lineStart: 1,
        lineEnd: 50,
        snippet: 'export default function LoginPage() {}',
      },
    ],
    rationale: '로그인 페이지가 존재하고 폼 핸들러가 연결됨',
    ...over,
  };
}

function baseSpurious(over: Record<string, unknown> = {}) {
  return {
    artifactType: 'page',
    path: 'apps/web/app/admin/secret/page.tsx',
    label: '관리자 비밀 페이지',
    rationale: 'PRD 에 정의되지 않은 추가 페이지',
    ...over,
  };
}

describe('PrdFeatureCategory', () => {
  it('exposes exactly the seven documented literals', () => {
    expect(PrdFeatureCategory.options).toEqual([
      'page', 'api', 'flow', 'data', 'integration', 'auth', 'other',
    ]);
  });

  it('rejects unknown categories', () => {
    expect(PrdFeatureCategory.safeParse('infra').success).toBe(false);
  });
});

describe('PrdFeaturePriority', () => {
  it('exposes exactly must/should/could (MoSCoW)', () => {
    expect(PrdFeaturePriority.options).toEqual(['must', 'should', 'could']);
  });

  it('rejects unknown priorities', () => {
    expect(PrdFeaturePriority.safeParse('won-t').success).toBe(false);
  });
});

describe('PrdMatchStatus', () => {
  it('exposes exactly implemented/partial/missing', () => {
    expect(PrdMatchStatus.options).toEqual(['implemented', 'partial', 'missing']);
  });
});

describe('PrdFeatureSchema', () => {
  it('parses a complete valid feature', () => {
    const parsed = PrdFeatureSchema.parse(baseFeature());
    expect(parsed.id).toBe('feat-login');
    expect(parsed.acceptanceCues).toHaveLength(3);
    expect(parsed.sourceSpan).toEqual({ startChar: 0, endChar: 120 });
  });

  it('accepts null sourceSpan (PRD without char offsets)', () => {
    const parsed = PrdFeatureSchema.parse(baseFeature({ sourceSpan: null }));
    expect(parsed.sourceSpan).toBeNull();
  });

  it('defaults acceptanceCues to empty array when omitted', () => {
    const { acceptanceCues: _drop, ...rest } = baseFeature();
    const parsed = PrdFeatureSchema.parse(rest);
    expect(parsed.acceptanceCues).toEqual([]);
  });

  it('rejects non-integer sourceSpan offsets', () => {
    const result = PrdFeatureSchema.safeParse(
      baseFeature({ sourceSpan: { startChar: 0.5, endChar: 1 } }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects unknown category literal', () => {
    const result = PrdFeatureSchema.safeParse(baseFeature({ category: 'infra' }));
    expect(result.success).toBe(false);
  });

  it('rejects missing required field (name)', () => {
    const { name: _drop, ...rest } = baseFeature();
    expect(PrdFeatureSchema.safeParse(rest).success).toBe(false);
  });
});

describe('PrdFeatureMatchSchema', () => {
  it('parses a complete valid match', () => {
    const parsed = PrdFeatureMatchSchema.parse(baseFeatureMatch());
    expect(parsed.status).toBe('implemented');
    expect(parsed.evidence).toHaveLength(1);
  });

  it('accepts evidence with null line offsets and snippet (file-level only)', () => {
    const parsed = PrdFeatureMatchSchema.parse(
      baseFeatureMatch({
        evidence: [{ path: 'a.ts', lineStart: null, lineEnd: null, snippet: null }],
      }),
    );
    expect(parsed.evidence[0]?.lineStart).toBeNull();
  });

  it('defaults evidence to empty array when omitted', () => {
    const { evidence: _drop, ...rest } = baseFeatureMatch();
    const parsed = PrdFeatureMatchSchema.parse(rest);
    expect(parsed.evidence).toEqual([]);
  });

  it('rejects invalid confidence literal', () => {
    const result = PrdFeatureMatchSchema.safeParse(
      baseFeatureMatch({ confidence: 'VERY_HIGH' }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects invalid status literal', () => {
    const result = PrdFeatureMatchSchema.safeParse(
      baseFeatureMatch({ status: 'done' }),
    );
    expect(result.success).toBe(false);
  });
});

describe('SpuriousArtifactSchema', () => {
  it('parses each artifactType literal', () => {
    for (const t of ['page', 'api', 'component', 'data_model'] as const) {
      const parsed = SpuriousArtifactSchema.parse(baseSpurious({ artifactType: t }));
      expect(parsed.artifactType).toBe(t);
    }
  });

  it('rejects unknown artifactType', () => {
    const result = SpuriousArtifactSchema.safeParse(
      baseSpurious({ artifactType: 'middleware' }),
    );
    expect(result.success).toBe(false);
  });
});

describe('PrdCoverageReportSchema', () => {
  function baseReport(over: Record<string, unknown> = {}) {
    return {
      totalFeatures: 3,
      matched: [baseFeatureMatch()],
      partial: [baseFeatureMatch({ status: 'partial' })],
      missing: [baseFeatureMatch({ status: 'missing' })],
      spurious: [baseSpurious()],
      coverageScore: 33.33,
      generatedAt: ISO,
      model: 'claude-opus-4-7',
      ...over,
    };
  }

  it('parses a complete valid report', () => {
    const parsed = PrdCoverageReportSchema.parse(baseReport());
    expect(parsed.totalFeatures).toBe(3);
    expect(parsed.matched).toHaveLength(1);
    expect(parsed.coverageScore).toBeCloseTo(33.33);
  });

  it('accepts model = null (extraction failed / model unknown)', () => {
    const parsed = PrdCoverageReportSchema.parse(baseReport({ model: null }));
    expect(parsed.model).toBeNull();
  });

  it('rejects negative totalFeatures', () => {
    expect(
      PrdCoverageReportSchema.safeParse(baseReport({ totalFeatures: -1 })).success,
    ).toBe(false);
  });

  it('rejects coverageScore outside 0..100', () => {
    expect(
      PrdCoverageReportSchema.safeParse(baseReport({ coverageScore: 101 })).success,
    ).toBe(false);
    expect(
      PrdCoverageReportSchema.safeParse(baseReport({ coverageScore: -0.1 })).success,
    ).toBe(false);
  });

  it('rejects non-integer totalFeatures', () => {
    expect(
      PrdCoverageReportSchema.safeParse(baseReport({ totalFeatures: 1.5 })).success,
    ).toBe(false);
  });
});

describe('PRD_MATCH_STATUS_LABELS_KO', () => {
  it('covers every PrdMatchStatus literal with non-empty label + description', () => {
    for (const value of PrdMatchStatus.options) {
      const entry = PRD_MATCH_STATUS_LABELS_KO[value];
      expect(entry).toBeDefined();
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it('has no extra keys beyond PrdMatchStatus', () => {
    expect(Object.keys(PRD_MATCH_STATUS_LABELS_KO).sort()).toEqual(
      [...PrdMatchStatus.options].sort(),
    );
  });

  it('key set matches PrdMatchStatus at the type level', () => {
    const _check: AssertEqual<keyof typeof PRD_MATCH_STATUS_LABELS_KO, PrdMatchStatus> = true;
    expect(_check).toBe(true);
  });
});

describe('PRD_FEATURE_CATEGORY_LABELS_KO', () => {
  it('covers every PrdFeatureCategory literal with non-empty label', () => {
    for (const value of PrdFeatureCategory.options) {
      const label = PRD_FEATURE_CATEGORY_LABELS_KO[value];
      expect(label).toBeDefined();
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('has no extra keys beyond PrdFeatureCategory', () => {
    expect(Object.keys(PRD_FEATURE_CATEGORY_LABELS_KO).sort()).toEqual(
      [...PrdFeatureCategory.options].sort(),
    );
  });

  it('key set matches PrdFeatureCategory at the type level', () => {
    const _check: AssertEqual<keyof typeof PRD_FEATURE_CATEGORY_LABELS_KO, PrdFeatureCategory> = true;
    expect(_check).toBe(true);
  });
});
