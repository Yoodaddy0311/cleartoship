// T1.2 — W1-A (launch readiness) checklist ID mapping.
//
// Audit checklist §1 "Launch Readiness" baseline: README, package.json scripts,
// license, CI config, tests dir. Each item declares an `evidence-key` so the
// pipeline (or any caller that produced a `W1AEvidence` map) can resolve a
// deterministic PASS/FAIL — eliminating the INDETERMINATE bucket that
// previously dominated the report's §1.
//
// The pipeline step that emits the evidence map is intentionally out of scope
// for this file: `evaluateW1AItem` is a pure function over the evidence map
// regardless of source (worker step output, fixture, manual override).
//
// Tag contract: any finding tagged with `W1-A` group + per-item sub-ID
// (e.g. `W1-A1`) renders inside the §1 launch-readiness grouping table.

import type { NormalizedFinding } from '../adapter.js';

export const W1A_GROUP_TAG = 'W1-A';

export type W1AEvidenceKey =
  | 'README_PRESENT'
  | 'PACKAGE_SCRIPTS_PRESENT'
  | 'LICENSE_PRESENT'
  | 'CI_CONFIG_PRESENT'
  | 'TESTS_DIR_PRESENT';

export type W1AEvidence = Record<W1AEvidenceKey, boolean>;

export interface W1AMeasuredBy {
  type: 'evidence-key';
  key: W1AEvidenceKey;
}

export interface W1AItem {
  id: string;
  label: string;
  description: string;
  measuredBy: W1AMeasuredBy;
}

export type W1AStatus = 'PASS' | 'FAIL' | 'INDETERMINATE';

export interface W1AResult {
  id: string;
  status: W1AStatus;
  evidenceKey: W1AEvidenceKey;
}

export const W1A_CHECKLIST: ReadonlyArray<W1AItem> = [
  {
    id: 'W1-A1',
    label: 'README 존재',
    description: '루트에 README.md(또는 README.*)가 있어 프로젝트 소개를 제공한다.',
    measuredBy: { type: 'evidence-key', key: 'README_PRESENT' },
  },
  {
    id: 'W1-A2',
    label: 'package.json 스크립트 정의',
    description: 'package.json 의 scripts 블록이 비어있지 않다(test/build/lint 등 최소 1개).',
    measuredBy: { type: 'evidence-key', key: 'PACKAGE_SCRIPTS_PRESENT' },
  },
  {
    id: 'W1-A3',
    label: '라이선스 파일',
    description: '루트에 LICENSE(또는 LICENSE.*) 파일이 존재해 사용 조건이 명시되어 있다.',
    measuredBy: { type: 'evidence-key', key: 'LICENSE_PRESENT' },
  },
  {
    id: 'W1-A4',
    label: 'CI 설정',
    description: 'CI 구성이 존재한다(.github/workflows/, .circleci/, .gitlab-ci.yml 등).',
    measuredBy: { type: 'evidence-key', key: 'CI_CONFIG_PRESENT' },
  },
  {
    id: 'W1-A5',
    label: '테스트 디렉터리',
    description: '테스트 코드 위치가 존재한다(tests/, __tests__/, *.test.* 파일 등).',
    measuredBy: { type: 'evidence-key', key: 'TESTS_DIR_PRESENT' },
  },
];

const META_BY_ID = new Map<string, W1AItem>(
  W1A_CHECKLIST.map((item) => [item.id, item]),
);

export const W1A_TAG_PREFIX_REGEX = /^W1-A\d+$/;

export function getW1AItem(id: string): W1AItem | undefined {
  return META_BY_ID.get(id);
}

export function isW1AId(tag: string): boolean {
  return W1A_TAG_PREFIX_REGEX.test(tag);
}

export function evaluateW1AItem(item: W1AItem, evidence: W1AEvidence): W1AResult {
  const key = item.measuredBy.key;
  const value = evidence[key];
  return {
    id: item.id,
    status: value ? 'PASS' : 'FAIL',
    evidenceKey: key,
  };
}

export function evaluateW1AChecklist(evidence: W1AEvidence): W1AResult[] {
  return W1A_CHECKLIST.map((item) => evaluateW1AItem(item, evidence));
}

// T1.2-FU — Convert FAIL'd W1-A results into normalized P2 findings so the
// rest of the pipeline (persist, score, render) can treat them like any other
// finding. PASS results emit nothing. Worker calls this between step04 (which
// populates `state.w1aEvidence`) and step11 (which persists pending findings).

const W1A_FINDING_TEMPLATES: Record<W1AEvidenceKey, { title: string; recommendation: string; impact: string }> = {
  README_PRESENT: {
    title: '루트에 README가 없습니다',
    recommendation: '`README.md` 를 루트에 추가하고 프로젝트 목적, 빠른 시작, 주요 명령을 한 페이지로 정리하세요.',
    impact: '새로운 개발자/사용자가 프로젝트 목적과 실행 방법을 파악할 수 없어 온보딩이 지연됩니다.',
  },
  PACKAGE_SCRIPTS_PRESENT: {
    title: 'package.json scripts 가 비어 있습니다',
    recommendation: '`package.json#scripts` 에 최소한 `test` / `build` / `lint` 중 하나를 등록해 표준 워크플로를 노출하세요.',
    impact: 'CI/IDE/CLI 가 표준 명령(`npm test`/`npm run build`)을 호출할 수 없어 자동화가 막힙니다.',
  },
  LICENSE_PRESENT: {
    title: '라이선스 파일이 없습니다',
    recommendation: '루트에 `LICENSE` (예: MIT/Apache-2.0) 파일을 추가해 사용 조건을 명시하세요.',
    impact: '라이선스가 없는 코드는 외부 사용자가 합법적으로 사용/배포할 수 없습니다.',
  },
  CI_CONFIG_PRESENT: {
    title: 'CI 설정이 없습니다',
    recommendation: '`.github/workflows/` / `.circleci/` / `.gitlab-ci.yml` 중 하나에 빌드+테스트 파이프라인을 추가하세요.',
    impact: 'PR 별 자동 검증이 없어 회귀가 메인에 진입할 위험이 높습니다.',
  },
  TESTS_DIR_PRESENT: {
    title: '테스트 디렉터리가 없습니다',
    recommendation: '`tests/` / `__tests__/` / `*.test.*` 형태로 최소 한 개의 테스트를 작성하고 디렉터리 구조를 노출하세요.',
    impact: '자동화된 테스트가 없으면 리팩토링/기능 추가 시 회귀 검증을 수동으로 수행해야 합니다.',
  },
};

export function buildW1AFindings(evidence: W1AEvidence): NormalizedFinding[] {
  const results = evaluateW1AChecklist(evidence);
  const out: NormalizedFinding[] = [];
  for (const r of results) {
    if (r.status !== 'FAIL') continue;
    const meta = getW1AItem(r.id);
    const tmpl = W1A_FINDING_TEMPLATES[r.evidenceKey];
    if (!meta || !tmpl) continue;
    out.push({
      title: tmpl.title,
      category: 'MAINTAINABILITY_DOCUMENTATION',
      severity: 'P2',
      confidence: 'HIGH',
      summary: `${meta.label} 항목이 충족되지 않았습니다 (${r.id}).`,
      nonDeveloperExplanation:
        '출시 직전 점검에서 빠지면 안 되는 기본 항목이 비어있어요. 추가 작업 분량은 보통 30분 이내입니다.',
      technicalExplanation: `W1-A checklist FAIL — id=${r.id}, evidenceKey=${r.evidenceKey}. ${meta.description}`,
      impact: tmpl.impact,
      recommendation: tmpl.recommendation,
      acceptanceCriteria: [`${meta.label} 가 측정 가능한 상태로 존재한다.`],
      tags: [W1A_GROUP_TAG, r.id],
      evidences: [],
    });
  }
  return out;
}
