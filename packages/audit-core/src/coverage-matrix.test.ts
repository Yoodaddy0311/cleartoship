// L-P0-5 (USP-2) — coverage matrix builder + renderer unit tests.
//
// Sibling-located on purpose: the review-gate hook treats `<name>.test.ts`
// adjacent to `<name>.ts` as proof-of-coverage.

import { describe, expect, it } from 'vitest';
import type { Finding } from '@cleartoship/shared-types';
import {
  COVERAGE_MATRIX_CLAIM_CAP,
  COVERAGE_PRIMARY_PATH_MAX_BYTES,
  buildCoverageMatrix,
  extractClaims,
  resolvePrimaryPath,
  summarizeCoverageMatrix,
  type DetectedFeatureHint,
} from './coverage-matrix.js';
import { renderCoverageMatrixMarkdown } from './render-coverage-matrix.js';

const ISO = '2026-05-18T05:00:00.000Z';

function f(over: Partial<Finding> = {}): Finding {
  return {
    id: 'f-1',
    auditRunId: 'run-1',
    title: 'sample',
    category: 'SECURITY_PRIVACY',
    severity: 'P1',
    confidence: 'HIGH',
    status: 'OPEN',
    summary: 'summary',
    nonDeveloperExplanation: null,
    technicalExplanation: null,
    impact: null,
    recommendation: null,
    acceptanceCriteria: [],
    tags: [],
    evidenceCount: 0,
    createdAt: ISO,
    ...over,
  };
}

const SAMPLE_PRD = `SaaS PRD v1.0
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
`;

const SAMPLE_FEATURES: ReadonlyArray<DetectedFeatureHint> = [
  {
    id: 'auth-signup',
    label: '이메일/비밀번호 회원가입',
    primaryPath: 'auth/signup.tsx',
    keywords: ['이메일', '비밀번호', '회원가입', 'signup', 'email'],
  },
  {
    id: 'auth-oauth',
    label: 'Google OAuth 로그인',
    primaryPath: 'auth/oauth.tsx',
    keywords: ['google', 'oauth', '로그인', 'login'],
  },
  {
    id: 'search-algolia',
    label: 'Algolia 검색',
    primaryPath: 'lib/search/algolia.ts',
    keywords: ['algolia', '검색', 'search'],
  },
  {
    id: 'profile-page',
    label: '프로필 페이지',
    primaryPath: 'app/profile/page.tsx',
    keywords: ['프로필', 'profile'],
  },
  {
    id: 'email-sendgrid',
    label: '이메일 알림',
    primaryPath: 'lib/email/sendgrid.ts',
    keywords: ['이메일', '알림', 'sendgrid', '메일', 'notification'],
  },
  {
    id: 'mobile-responsive',
    label: '모바일 반응형 디자인',
    primaryPath: 'styles/responsive.css',
    keywords: ['모바일', '반응형', 'mobile', 'responsive'],
  },
  {
    id: 'i18n-ko',
    label: '한국어 영어 다국어',
    primaryPath: 'i18n/ko.ts',
    keywords: ['한국어', '영어', '다국어', 'i18n'],
  },
];

// ---------------------------------------------------------------------------
// extractClaims
// ---------------------------------------------------------------------------

describe('extractClaims (spec §C.5 input)', () => {
  it('returns [] for null / undefined / empty PRD', () => {
    expect(extractClaims(null)).toEqual([]);
    expect(extractClaims(undefined)).toEqual([]);
    expect(extractClaims('')).toEqual([]);
    expect(extractClaims('   \n\n  ')).toEqual([]);
  });

  it('extracts 10 bullet claims from the spec §C.4.1 sample PRD', () => {
    const claims = extractClaims(SAMPLE_PRD);
    expect(claims).toHaveLength(10);
    expect(claims[0]!.text).toContain('이메일');
    expect(claims[2]!.text).toContain('Stripe');
    expect(claims[9]!.text).toContain('모바일');
  });

  it('skips Markdown headings and setext underlines (=====, -----)', () => {
    const text = '# Heading\nSaaS PRD v1.0\n=============\n- Real claim line 어쩌고저쩌고';
    const claims = extractClaims(text);
    expect(claims).toHaveLength(1);
    expect(claims[0]!.text).toContain('Real claim line');
  });

  it('dedups claims that normalize to the same key (case + whitespace)', () => {
    const text = '- Stripe 결제 처리\n- stripe   결제   처리\n- STRIPE 결제 처리';
    const claims = extractClaims(text);
    expect(claims).toHaveLength(1);
  });

  it('caps the output at maxClaims (default 50, override respected)', () => {
    const long = Array.from({ length: 80 }, (_, i) => `- claim number ${i} 어쩌고저쩌고`).join('\n');
    expect(extractClaims(long)).toHaveLength(COVERAGE_MATRIX_CLAIM_CAP);
    expect(extractClaims(long, { maxClaims: 5 })).toHaveLength(5);
  });

  it('marks PRD-shaped lines (해야/지원/must/should) with looksLikePrd=true', () => {
    const text = '- 결제는 처리해야 한다\n- 결제는 그냥 좋다';
    const claims = extractClaims(text);
    expect(claims[0]!.looksLikePrd).toBe(true);
  });

  it('non-bulleted prose without PRD verbs is skipped (avoid markdown body noise)', () => {
    const text = 'This is just narrative prose with no actionable claim.';
    expect(extractClaims(text)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildCoverageMatrix — §C.5 algorithm 3 states
// ---------------------------------------------------------------------------

describe('buildCoverageMatrix (spec §C.5 algorithm)', () => {
  it('detector hit + no blocking finding → fulfilled (✅) with file evidence', () => {
    const result = buildCoverageMatrix({
      prdText: '- 사용자는 이메일과 비밀번호로 회원가입할 수 있어야 한다',
      detectedFeatures: [SAMPLE_FEATURES[0]!],
      findings: [],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe('fulfilled');
    expect(result[0]!.evidence).toEqual([
      { type: 'file', path: 'auth/signup.tsx' },
    ]);
    expect(result[0]!.recommendation).toBeUndefined();
  });

  it('detector hit + blocking P1 finding → partial (⚠️) with file + finding evidence', () => {
    const result = buildCoverageMatrix({
      prdText: '- Google OAuth 로그인을 지원한다',
      detectedFeatures: [SAMPLE_FEATURES[1]!],
      findings: [
        f({
          id: 'CC-SEC-006',
          severity: 'P1',
          title: 'OAuth redirect_uri whitelist 누락',
          tags: ['oauth'],
          actionHint: { text: 'redirect_uri whitelist 적용', etaMinutes: 30 },
        }),
      ],
    });
    expect(result[0]!.status).toBe('partial');
    expect(result[0]!.evidence).toEqual([
      { type: 'file', path: 'auth/oauth.tsx' },
      { type: 'finding', findingId: 'CC-SEC-006' },
    ]);
    expect(result[0]!.recommendation).toBe('redirect_uri whitelist 적용');
  });

  it('detector miss → unclear (❓) with empty evidence and recommendation', () => {
    const result = buildCoverageMatrix({
      prdText: '- Stripe로 월구독 결제를 처리한다',
      detectedFeatures: [], // no detector matches
      findings: [],
    });
    expect(result[0]!.status).toBe('unclear');
    expect(result[0]!.evidence).toEqual([]);
    expect(result[0]!.recommendation).toBe('구현 또는 PRD 수정');
  });

  it('blocking P2/P3 findings do NOT downgrade fulfilled (only P0/P1)', () => {
    const result = buildCoverageMatrix({
      prdText: '- Algolia를 통한 검색 기능을 제공한다',
      detectedFeatures: [SAMPLE_FEATURES[2]!],
      findings: [
        f({ id: 'p2', severity: 'P2', title: 'algolia 검색 최적화', tags: ['algolia'] }),
        f({ id: 'p3', severity: 'P3', title: 'algolia 검색 docs', tags: ['algolia'] }),
      ],
    });
    expect(result[0]!.status).toBe('fulfilled');
  });

  it('multiple blocking findings → all attached as evidence in order', () => {
    const result = buildCoverageMatrix({
      prdText: '- 이메일 알림을 처리한다',
      detectedFeatures: [SAMPLE_FEATURES[4]!],
      findings: [
        f({ id: 'a', severity: 'P0', title: '이메일 발송 미인증', tags: ['이메일'] }),
        f({ id: 'b', severity: 'P1', title: '이메일 unsubscribe 누락', tags: ['이메일'] }),
      ],
    });
    expect(result[0]!.status).toBe('partial');
    expect(result[0]!.evidence).toHaveLength(3); // file + 2 findings
    expect(result[0]!.evidence.filter((e) => e.type === 'finding')).toHaveLength(2);
  });

  it('end-to-end: spec §C.4 sample PRD produces 10 entries with mixed statuses', () => {
    const result = buildCoverageMatrix({
      prdText: SAMPLE_PRD,
      detectedFeatures: SAMPLE_FEATURES,
      findings: [
        f({
          id: 'CC-SEC-006',
          severity: 'P1',
          title: 'OAuth redirect_uri whitelist',
          tags: ['oauth'],
        }),
      ],
    });
    expect(result).toHaveLength(10);
    const summary = summarizeCoverageMatrix(result);
    expect(summary.total).toBe(10);
    // At least one of each status given the fixture topology.
    expect(summary.fulfilled).toBeGreaterThan(0);
    expect(summary.partial).toBeGreaterThan(0);
    expect(summary.unclear).toBeGreaterThan(0);
    expect(summary.fulfilled + summary.partial + summary.unclear).toBe(10);
  });

  it('falls back to finding.recommendation when actionHint is absent', () => {
    const result = buildCoverageMatrix({
      prdText: '- Google OAuth 로그인을 지원한다',
      detectedFeatures: [SAMPLE_FEATURES[1]!],
      findings: [
        f({
          id: 'x',
          severity: 'P0',
          title: 'OAuth boom',
          tags: ['oauth'],
          recommendation: '환경변수 GOOGLE_CLIENT_ID 분리',
        }),
      ],
    });
    expect(result[0]!.recommendation).toBe('환경변수 GOOGLE_CLIENT_ID 분리');
  });

  it('returns [] when prdText is null/empty (renderer omits §2 section)', () => {
    expect(
      buildCoverageMatrix({
        prdText: null,
        detectedFeatures: SAMPLE_FEATURES,
        findings: [],
      }),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// summarizeCoverageMatrix
// ---------------------------------------------------------------------------

describe('summarizeCoverageMatrix', () => {
  it('counts each status and computes fulfillmentRate', () => {
    const result = buildCoverageMatrix({
      prdText: SAMPLE_PRD,
      detectedFeatures: SAMPLE_FEATURES,
      findings: [],
    });
    const summary = summarizeCoverageMatrix(result);
    expect(summary.total).toBe(result.length);
    expect(summary.fulfillmentRate).toBeGreaterThanOrEqual(0);
    expect(summary.fulfillmentRate).toBeLessThanOrEqual(1);
  });

  it('handles empty input without divide-by-zero', () => {
    const summary = summarizeCoverageMatrix([]);
    expect(summary).toEqual({
      total: 0,
      fulfilled: 0,
      partial: 0,
      unclear: 0,
      fulfillmentRate: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// renderCoverageMatrixMarkdown
// ---------------------------------------------------------------------------

describe('renderCoverageMatrixMarkdown (spec §C.3 format)', () => {
  it('returns empty string for an empty entry list (§C.6 — section omitted)', () => {
    expect(renderCoverageMatrixMarkdown([])).toBe('');
  });

  it('renders §2 heading + summary line + GFM table', () => {
    const entries = buildCoverageMatrix({
      prdText: '- Stripe 결제를 처리한다',
      detectedFeatures: [],
      findings: [],
    });
    const md = renderCoverageMatrixMarkdown(entries);
    expect(md).toContain('## §2 PRD Coverage Matrix');
    expect(md).toContain('PRD 클레임 1건 중');
    expect(md).toContain('| Claim |');
    expect(md).toContain('❓');
  });

  it('uses the correct status icon for each row (✅/⚠️/❓)', () => {
    const entries = buildCoverageMatrix({
      prdText: SAMPLE_PRD,
      detectedFeatures: SAMPLE_FEATURES,
      findings: [
        f({
          id: 'CC-SEC-006',
          severity: 'P1',
          title: 'OAuth issue',
          tags: ['oauth'],
        }),
      ],
    });
    const md = renderCoverageMatrixMarkdown(entries);
    expect(md).toContain('✅');
    expect(md).toContain('⚠️');
    expect(md).toContain('❓');
  });

  it('escapes pipe characters inside claim/evidence cells', () => {
    const entries = buildCoverageMatrix({
      prdText: '- a | b | c 결제를 처리한다',
      detectedFeatures: [],
      findings: [],
    });
    const md = renderCoverageMatrixMarkdown(entries);
    expect(md).toContain('\\|');
  });

  it('appends a truncation footnote when entries exceed maxRows', () => {
    const many = Array.from({ length: 60 }, (_, i) => `- claim number ${i} 어쩌고를 처리한다`).join('\n');
    const entries = buildCoverageMatrix({
      prdText: many,
      detectedFeatures: [],
      findings: [],
    });
    const md = renderCoverageMatrixMarkdown(entries, { maxRows: 10 });
    expect(md).toContain('claim');
    expect(md).toContain('전체는 JSON export');
  });
});
