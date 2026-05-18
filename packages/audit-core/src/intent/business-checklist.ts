// T2.8 / UPG-06 — W2-BR (Business Readiness) checklist.
//
// Five sub-categories that determine whether a product is "ready for paying
// customers" beyond raw code quality: pricing surface, legal documents,
// onboarding flow, support channel, analytics instrumentation. Each item
// declares an `evidence-key` so the pipeline (or a fixture/manual override)
// can resolve a deterministic PASS/FAIL identical to the W1-A pattern.
//
// Phase 1 scope: Legal + Analytics have real detectors; Pricing / Onboarding /
// Support fall through with `false` (FAIL) emitting a finding that signals
// "not yet measured" rather than silently dropping. This keeps the checklist
// shape stable across phases and lets Phase 2 fill detection without schema
// churn.
//
// Tag contract: any finding tagged with `W2-BR` group + per-item sub-ID
// (e.g. `W2-BR1`) renders inside the §8 Business Readiness section.

import type { NormalizedFinding } from '../adapter.js';

export const W2_BR_GROUP_TAG = 'W2-BR';

export type BusinessEvidenceKey =
  | 'PRICING_PAGE_PRESENT'
  | 'LEGAL_DOCS_PRESENT'
  | 'ONBOARDING_FLOW_PRESENT'
  | 'SUPPORT_CHANNEL_PRESENT'
  | 'ANALYTICS_INSTALLED';

export type BusinessEvidence = Record<BusinessEvidenceKey, boolean>;

export interface BusinessMeasuredBy {
  type: 'evidence-key';
  key: BusinessEvidenceKey;
}

export interface BusinessItem {
  id: string;
  label: string;
  description: string;
  measuredBy: BusinessMeasuredBy;
}

export type BusinessStatus = 'PASS' | 'FAIL' | 'INDETERMINATE';

export interface BusinessResult {
  id: string;
  status: BusinessStatus;
  evidenceKey: BusinessEvidenceKey;
}

export const BUSINESS_READINESS_CHECKLIST: ReadonlyArray<BusinessItem> = [
  {
    id: 'W2-BR1',
    label: '가격 페이지',
    description: '가격/요금제 페이지가 노출되어 결제 의향이 있는 방문자가 비용을 확인할 수 있다.',
    measuredBy: { type: 'evidence-key', key: 'PRICING_PAGE_PRESENT' },
  },
  {
    id: 'W2-BR2',
    label: '법적 문서 (개인정보처리방침/이용약관)',
    description: '개인정보 처리방침과 이용약관 문서가 저장소에 존재한다.',
    measuredBy: { type: 'evidence-key', key: 'LEGAL_DOCS_PRESENT' },
  },
  {
    id: 'W2-BR3',
    label: '온보딩 플로우',
    description: '회원가입 또는 신규 사용자를 안내하는 진입 흐름(signup/onboarding)이 존재한다.',
    measuredBy: { type: 'evidence-key', key: 'ONBOARDING_FLOW_PRESENT' },
  },
  {
    id: 'W2-BR4',
    label: '고객 지원 채널',
    description: '문의 페이지 또는 mailto/지원 이메일이 노출되어 사용자가 도움을 요청할 수 있다.',
    measuredBy: { type: 'evidence-key', key: 'SUPPORT_CHANNEL_PRESENT' },
  },
  {
    id: 'W2-BR5',
    label: '분석 도구',
    description: 'GA / Plausible / PostHog 등 사용자 분석 스크립트가 설치되어 핵심 지표 수집이 가능하다.',
    measuredBy: { type: 'evidence-key', key: 'ANALYTICS_INSTALLED' },
  },
];

const META_BY_ID = new Map<string, BusinessItem>(
  BUSINESS_READINESS_CHECKLIST.map((item) => [item.id, item]),
);

export const W2_BR_TAG_PREFIX_REGEX = /^W2-BR\d+$/;

export function getBusinessItem(id: string): BusinessItem | undefined {
  return META_BY_ID.get(id);
}

export function isBusinessReadinessId(tag: string): boolean {
  return W2_BR_TAG_PREFIX_REGEX.test(tag);
}

export function evaluateBusinessReadinessItem(
  item: BusinessItem,
  evidence: BusinessEvidence,
): BusinessResult {
  const key = item.measuredBy.key;
  const value = evidence[key];
  return {
    id: item.id,
    status: value ? 'PASS' : 'FAIL',
    evidenceKey: key,
  };
}

export function evaluateBusinessReadinessChecklist(
  evidence: BusinessEvidence,
): BusinessResult[] {
  return BUSINESS_READINESS_CHECKLIST.map((item) =>
    evaluateBusinessReadinessItem(item, evidence),
  );
}

const FINDING_TEMPLATES: Record<
  BusinessEvidenceKey,
  { title: string; recommendation: string; impact: string; nonDeveloper: string }
> = {
  PRICING_PAGE_PRESENT: {
    title: '가격 페이지가 보이지 않습니다',
    recommendation:
      '/pricing, /plans, /billing 중 하나에 가격 페이지를 추가하거나 푸터/네비게이션에서 노출하세요.',
    impact:
      '가격 정보 없이는 결제 의향 방문자가 이탈할 가능성이 높아 매출 손실로 이어집니다.',
    nonDeveloper:
      '"얼마인지 모르겠어요" 라는 첫인상을 줍니다. 가격이 공개되지 않으면 결제 단계로 진입하는 사용자 수가 크게 줄어듭니다.',
  },
  LEGAL_DOCS_PRESENT: {
    title: '개인정보처리방침/이용약관 문서가 없습니다',
    recommendation:
      '저장소에 `privacy-policy.md` / `terms.md` (또는 동등한 페이지 라우트) 를 추가하고 푸터에서 링크하세요.',
    impact:
      '개인정보 수집 시 법정 고지 의무를 위반하며, 결제 또는 회원가입 기능 운영 시 법적 리스크가 발생합니다.',
    nonDeveloper:
      '법적으로 반드시 있어야 하는 문서입니다. 없으면 정식 출시 후 과태료/소송 위험이 있습니다.',
  },
  ONBOARDING_FLOW_PRESENT: {
    title: '온보딩 플로우가 확인되지 않습니다',
    recommendation:
      '회원가입(/signup, /register) 또는 첫 사용자 가이드 화면을 추가해 신규 사용자가 핵심 가치까지 도달하도록 안내하세요.',
    impact:
      '진입 흐름이 없으면 신규 사용자가 "무엇부터 해야 할지" 알 수 없어 활성화율(activation rate) 이 떨어집니다.',
    nonDeveloper:
      '처음 방문한 사용자가 "그래서 뭘 해야 하지?" 상태로 떠나갑니다. 가입/사용 시작 흐름이 있어야 합니다.',
  },
  SUPPORT_CHANNEL_PRESENT: {
    title: '고객 지원 채널이 노출되어 있지 않습니다',
    recommendation:
      '`mailto:support@…` 링크가 있는 문의 페이지(/contact, /support) 또는 채팅/티켓 위젯을 추가하세요.',
    impact:
      '문제 발생 시 사용자가 도움을 요청할 경로가 없어 신뢰가 하락하고 이탈로 이어집니다.',
    nonDeveloper:
      '문제가 생겨도 어디에 물어봐야 할지 보이지 않습니다. 최소한 이메일 주소라도 노출해야 합니다.',
  },
  ANALYTICS_INSTALLED: {
    title: '사용자 분석 도구가 설치되어 있지 않습니다',
    recommendation:
      'Google Analytics(gtag) / Plausible / PostHog 중 하나의 스크립트를 _document 또는 layout 에 추가해 페이지뷰/이벤트를 수집하세요.',
    impact:
      '실제 사용 데이터 없이 운영하면 무엇이 성장하고 무엇이 막혀 있는지 측정할 수 없어 PMF 검증이 지연됩니다.',
    nonDeveloper:
      '"사람들이 어디서 막혀요?" 질문에 답할 수 없습니다. 최소한의 트래픽/이벤트 측정 도구는 출시 전에 필요합니다.',
  },
};

/**
 * Convert FAIL'd business-readiness results into normalized P1 findings.
 * PASS results emit nothing. Worker calls this between the
 * ANALYZE_BUSINESS_READINESS step (which populates `state.businessEvidence`)
 * and MAP_CHECKLIST (which persists pending findings).
 */
export function buildBusinessReadinessFindings(
  evidence: BusinessEvidence,
): NormalizedFinding[] {
  const results = evaluateBusinessReadinessChecklist(evidence);
  const out: NormalizedFinding[] = [];
  for (const r of results) {
    if (r.status !== 'FAIL') continue;
    const meta = getBusinessItem(r.id);
    const tmpl = FINDING_TEMPLATES[r.evidenceKey];
    if (!meta || !tmpl) continue;
    out.push({
      title: tmpl.title,
      category: 'BUSINESS_READINESS',
      severity: 'P1',
      confidence: 'HIGH',
      summary: `${meta.label} 항목이 충족되지 않았습니다 (${r.id}).`,
      nonDeveloperExplanation: tmpl.nonDeveloper,
      technicalExplanation: `W2-BR checklist FAIL — id=${r.id}, evidenceKey=${r.evidenceKey}. ${meta.description}`,
      impact: tmpl.impact,
      recommendation: tmpl.recommendation,
      acceptanceCriteria: [`${meta.label} 가 측정 가능한 상태로 존재한다.`],
      tags: [W2_BR_GROUP_TAG, r.id],
      evidences: [],
    });
  }
  return out;
}

export const EMPTY_BUSINESS_EVIDENCE: BusinessEvidence = {
  PRICING_PAGE_PRESENT: false,
  LEGAL_DOCS_PRESENT: false,
  ONBOARDING_FLOW_PRESENT: false,
  SUPPORT_CHANNEL_PRESENT: false,
  ANALYTICS_INSTALLED: false,
};
