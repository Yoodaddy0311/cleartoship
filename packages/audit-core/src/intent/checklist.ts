// T1.2 — Generic ChecklistItem + evaluator (PoC: W1-A1 only).
//
// Provides the shared `ChecklistItem` shape consumed by W1-A (launch
// readiness), and a pure `evaluateChecklistItem` evaluator that resolves an
// item to PASS / FAIL / INDETERMINATE against an AuditEvidence map.
//
// Scope (T1.2 PoC): only W1-A1 (README presence) is active here. W1-A2..A5 are
// declared in `LAUNCH_READINESS_DEFERRED` so the IDs are stable and reviewers
// can see the planned shape, but they are intentionally NOT in
// `LAUNCH_READINESS_CHECKLIST` until the T1.3 bundle activates them with
// matching step04 evidence-emit work.

import type { AuditEvidence, EvidenceKey } from './audit-evidence.js';

export type ChecklistStatus = 'PASS' | 'FAIL' | 'INDETERMINATE';

export interface EvidenceKeyMeasure {
  type: 'evidence-key';
  key: EvidenceKey;
}

export interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  measuredBy: EvidenceKeyMeasure;
}

export interface ChecklistResult {
  id: string;
  status: ChecklistStatus;
  evidenceKey: EvidenceKey;
}

export const W1_A1_README: ChecklistItem = {
  id: 'W1-A1',
  label: 'README 존재',
  description: '루트에 README.md(또는 README.*)가 있어 프로젝트 소개를 제공한다.',
  measuredBy: { type: 'evidence-key', key: 'README_PRESENT' },
};

/**
 * Active launch-readiness checklist (T1.2 PoC). W1-A1 only.
 * Add W1-A2..A5 here once T1.3 bundle wires their evidence keys.
 */
export const LAUNCH_READINESS_CHECKLIST: ReadonlyArray<ChecklistItem> = [W1_A1_README];

/**
 * Reserved-but-not-active items. IDs are stable; descriptions document intent
 * so T1.3 implementer can wire them without re-debating shape.
 */
export const LAUNCH_READINESS_DEFERRED: ReadonlyArray<ChecklistItem> = [
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

/**
 * Pure evaluator. INDETERMINATE only when the evidence key is missing from the
 * map — never when the key is explicitly false.
 */
export function evaluateChecklistItem(
  item: ChecklistItem,
  evidence: AuditEvidence,
): ChecklistResult {
  const key = item.measuredBy.key;
  const value = evidence[key];
  let status: ChecklistStatus;
  if (value === true) status = 'PASS';
  else if (value === false) status = 'FAIL';
  else status = 'INDETERMINATE';
  return { id: item.id, status, evidenceKey: key };
}

export function evaluateChecklist(
  items: ReadonlyArray<ChecklistItem>,
  evidence: AuditEvidence,
): ChecklistResult[] {
  return items.map((item) => evaluateChecklistItem(item, evidence));
}
