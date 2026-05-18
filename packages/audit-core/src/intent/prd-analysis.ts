// T2.1 / W2-C — PRD claim analysis (No-LLM keyword matching).
//
// Scans repo docs (README, CHANGELOG, docs/PRD, …) for stage keywords —
// MVP / Alpha / Beta / Production-ready — in both en-US and ko-KR. The
// worker step 04c populates `state.prdAnalysis`; step11 calls
// `buildClaimMismatchFindings` to flag claims that don't match measured
// reality (e.g. "Production-ready" but launch readiness W1-A not all PASS).
//
// SSOT: keyword table + claim rules live here; the worker only knows how to
// read files and pass strings into `analyzePrdText`.

import type { NormalizedFinding } from '../adapter.js';

export const W2C_GROUP_TAG = 'W2-C';

export const PRD_CLAIM_KEYS = [
  'mvpClaimed',
  'alphaClaimed',
  'betaClaimed',
  'productionClaimed',
] as const;

export type PrdClaimKey = (typeof PRD_CLAIM_KEYS)[number];

export type PrdLocale = 'en-US' | 'ko-KR';

export interface PrdKeywordEntry {
  /** Literal phrase or `\b`-anchored regex source (case-insensitive). */
  pattern: RegExp;
  /** Display form for the keyword (used in tags / report). */
  label: string;
  locale: PrdLocale;
}

export interface PrdKeywordHit {
  claim: PrdClaimKey;
  match: string;
  source: string;
  locale: PrdLocale;
}

export interface PrdAnalysis {
  mvpClaimed: boolean;
  alphaClaimed: boolean;
  betaClaimed: boolean;
  productionClaimed: boolean;
  keywords: PrdKeywordHit[];
  sources: string[];
}

export const PRD_KEYWORD_MAP: Record<PrdClaimKey, ReadonlyArray<PrdKeywordEntry>> = {
  mvpClaimed: [
    { pattern: /\bMVP\b/i, label: 'MVP', locale: 'en-US' },
    { pattern: /\bminimum viable product\b/i, label: 'minimum viable product', locale: 'en-US' },
    { pattern: /최소[\s]?기능[\s]?(제품|버전)/, label: '최소 기능 제품', locale: 'ko-KR' },
    { pattern: /\bMVP[\s]?(단계|버전)?/, label: 'MVP 단계', locale: 'ko-KR' },
  ],
  alphaClaimed: [
    { pattern: /\balpha\b/i, label: 'alpha', locale: 'en-US' },
    { pattern: /알파[\s]?(버전|단계|테스트)/, label: '알파 단계', locale: 'ko-KR' },
  ],
  betaClaimed: [
    { pattern: /\bbeta\b/i, label: 'beta', locale: 'en-US' },
    { pattern: /베타[\s]?(버전|단계|테스트)?/, label: '베타', locale: 'ko-KR' },
  ],
  productionClaimed: [
    { pattern: /\bproduction[\s-]?ready\b/i, label: 'production-ready', locale: 'en-US' },
    { pattern: /\bproduction\b/i, label: 'production', locale: 'en-US' },
    { pattern: /\bGA\b/, label: 'GA', locale: 'en-US' },
    { pattern: /\bgenerally available\b/i, label: 'generally available', locale: 'en-US' },
    { pattern: /출시[\s]?준비/, label: '출시 준비', locale: 'ko-KR' },
    { pattern: /정식[\s]?(출시|배포|버전)/, label: '정식 출시', locale: 'ko-KR' },
    { pattern: /상용[\s]?(서비스|버전|배포)/, label: '상용 배포', locale: 'ko-KR' },
  ],
};

export function emptyPrdAnalysis(): PrdAnalysis {
  return {
    mvpClaimed: false,
    alphaClaimed: false,
    betaClaimed: false,
    productionClaimed: false,
    keywords: [],
    sources: [],
  };
}

export function analyzePrdText(text: string, source: string): PrdAnalysis {
  const out = emptyPrdAnalysis();
  let matched = false;
  for (const key of PRD_CLAIM_KEYS) {
    for (const entry of PRD_KEYWORD_MAP[key]) {
      const m = text.match(entry.pattern);
      if (m) {
        out[key] = true;
        out.keywords.push({
          claim: key,
          match: m[0],
          source,
          locale: entry.locale,
        });
        matched = true;
      }
    }
  }
  if (matched) out.sources.push(source);
  return out;
}

export function mergePrdAnalyses(parts: ReadonlyArray<PrdAnalysis>): PrdAnalysis {
  const out = emptyPrdAnalysis();
  for (const p of parts) {
    out.mvpClaimed = out.mvpClaimed || p.mvpClaimed;
    out.alphaClaimed = out.alphaClaimed || p.alphaClaimed;
    out.betaClaimed = out.betaClaimed || p.betaClaimed;
    out.productionClaimed = out.productionClaimed || p.productionClaimed;
    out.keywords.push(...p.keywords);
    for (const s of p.sources) {
      if (!out.sources.includes(s)) out.sources.push(s);
    }
  }
  return out;
}

export interface ClaimMismatchSignals {
  /** True when all W1-A launch-readiness items PASS. */
  w1aAllPass: boolean;
  /** Count of P0 findings already in the run. */
  severityCountsP0: number;
}

export function buildClaimMismatchFindings(
  analysis: PrdAnalysis,
  signals: ClaimMismatchSignals,
): NormalizedFinding[] {
  const out: NormalizedFinding[] = [];

  if (analysis.productionClaimed && !signals.w1aAllPass) {
    out.push({
      title: 'Production 출시 주장이 launch readiness 측정 결과와 일치하지 않습니다',
      category: 'MAINTAINABILITY_DOCUMENTATION',
      severity: 'P1',
      confidence: 'MEDIUM',
      summary:
        '문서에서 production-ready / 정식 출시 신호가 발견됐지만 W1-A 체크리스트가 모두 PASS 가 아닙니다.',
      nonDeveloperExplanation:
        '“정식 출시 준비됨”이라고 적혀 있는데, README/LICENSE/CI/테스트 같은 출시 직전 점검 항목이 비어있어요. 문서와 실제 상태를 맞춰주세요.',
      technicalExplanation:
        'W2-C CLAIM_MISMATCH — productionClaimed=true && w1aAllPass=false. 문서 표기를 조정하거나 W1-A 실패 항목을 해결해야 합니다.',
      impact:
        '사용자/투자자가 문서를 보고 production-grade 라고 신뢰했다가 실측 상태와 어긋나는 risk가 발생합니다.',
      recommendation:
        'W1-A 실패 항목을 모두 해결하거나, 문서의 production 주장을 “beta” / “preview” 등으로 정정하세요.',
      acceptanceCriteria: [
        '문서 상의 production 주장이 측정된 launch readiness 와 일치한다.',
      ],
      tags: [W2C_GROUP_TAG, 'CLAIM_MISMATCH', 'PRODUCTION_VS_W1A'],
      evidences: [],
    });
  }

  if (analysis.productionClaimed && signals.severityCountsP0 > 0) {
    out.push({
      title: 'Production 주장 상태에서 P0 finding 이 잔존합니다',
      category: 'MAINTAINABILITY_DOCUMENTATION',
      severity: 'P1',
      confidence: 'MEDIUM',
      summary: `production-ready 신호가 있으나 P0 severity finding ${signals.severityCountsP0}건이 남아 있습니다.`,
      nonDeveloperExplanation:
        '“정식 출시 단계”라고 적혀 있는데 가장 심각한 문제(P0)가 해결되지 않은 상태입니다. 실제로 출시하기 전 P0 을 우선 정리해야 합니다.',
      technicalExplanation:
        'W2-C CLAIM_MISMATCH — productionClaimed=true && severityCounts.P0>0.',
      impact: 'P0 잔존 상태로 production 배포 시 보안/안정성 사고 발생 가능성이 높습니다.',
      recommendation: 'P0 finding 을 모두 해결한 뒤 production 단계 선언을 유지하세요.',
      acceptanceCriteria: ['production 주장과 P0 finding 잔존이 동시에 존재하지 않는다.'],
      tags: [W2C_GROUP_TAG, 'CLAIM_MISMATCH', 'PRODUCTION_VS_P0'],
      evidences: [],
    });
  }

  if (analysis.mvpClaimed && signals.severityCountsP0 > 0) {
    out.push({
      title: 'MVP 단계 — P0 finding 우선 해결을 권장합니다',
      category: 'MAINTAINABILITY_DOCUMENTATION',
      severity: 'P2',
      confidence: 'MEDIUM',
      summary: `MVP 신호 + P0 finding ${signals.severityCountsP0}건. MVP 출시 전 P0 해결을 권장합니다.`,
      nonDeveloperExplanation:
        'MVP 라도 P0 (가장 심각) 문제는 출시 전에 해결하는 것이 안전합니다.',
      technicalExplanation: 'W2-C CLAIM_MISMATCH — mvpClaimed=true && severityCounts.P0>0.',
      impact: 'MVP 사용자에게도 P0 문제가 노출되면 early feedback 의 신뢰도가 떨어집니다.',
      recommendation: 'MVP 출시 직전 P0 finding 을 정리하세요. P1 이하는 follow-up 으로 둬도 됩니다.',
      acceptanceCriteria: ['MVP 출시 시점에 P0 잔존 finding 이 0건이다.'],
      tags: [W2C_GROUP_TAG, 'CLAIM_MISMATCH', 'MVP_VS_P0'],
      evidences: [],
    });
  }

  return out;
}
