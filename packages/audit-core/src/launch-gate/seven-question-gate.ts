import {
  LAUNCH_VERDICT_LABELS_KO,
  type LaunchAnswer,
  type LaunchGateResult,
  type LaunchQuestion,
  type LaunchQuestionId,
  type LaunchVerdict,
} from '@cleartoship/shared-types';

/**
 * Audit Quality Roadmap §4.1 — 7-Question Launch Gate (deterministic).
 *
 * Pure evaluator: given the D-bucket evidence the pipeline already produces,
 * answer 7 launch-readiness questions (YES / NO / UNKNOWN) and derive a single
 * 4-state verdict. No LLM, no network — the same commit always yields the same
 * verdict. The worker assembles `LaunchGateEvidence` from `state` (W1-A file
 * markers + scoring internals) and persists the result on the report; the
 * dashboard renders it as a chip (see `launch-verdict-chip.tsx`).
 *
 * Honesty constraints (why some questions are softer than the §4.1 prose):
 *   - "production claim verified" (Q1) and "tests pass" (Q3) cannot be asserted
 *     deterministically in a 1-shot audit. Q1 uses README presence (claim
 *     verification is a Phase 3 / LLM hook via `readmeClaimVerified`); Q3 uses
 *     CI-config + tests-directory presence as the achievable proxy for
 *     "CI + tests".
 *   - "CONTRIBUTING" (Q2) is not yet a tracked file marker, so it is an
 *     optional bonus in the evidence, never a requirement.
 *   - UNKNOWN ≠ NO: a check whose evidence never arrived (e.g. no deploy URL →
 *     Lighthouse never ran) is UNKNOWN, and UNKNOWN alone never produces a
 *     BLOCK / FIX_FIRST verdict.
 */

/** Score at/above which a 0–100 category counts as "passing" for the gate. */
export const LAUNCH_GATE_PASS_THRESHOLD = 70;

export interface LaunchGateEvidence {
  /** W1-A README_PRESENT. */
  readonly hasReadme: boolean;
  /**
   * Phase 3 (LLM) hook: whether the README's production claim was verified
   * against measured reality. `null`/`undefined` = not assessed (Phase 1
   * answers Q1 from README presence alone). `false` = claim contradicts
   * reality → Q1 NO.
   */
  readonly readmeClaimVerified?: boolean | null;
  /** W1-A LICENSE_PRESENT. */
  readonly hasLicense: boolean;
  /** Optional bonus — CONTRIBUTING is not yet a deterministic file marker. */
  readonly hasContributing?: boolean;
  /** W1-A CI_CONFIG_PRESENT. */
  readonly hasCiConfig: boolean;
  /** W1-A TESTS_DIR_PRESENT. */
  readonly hasTests: boolean;
  /** P0 finding count (from severityCounts). */
  readonly p0Count: number;
  /** Whether the deploy URL was reachable for dynamic analysis. */
  readonly deployUrlReachable: boolean;
  /** UX_UI category score (Lighthouse-derived). `null` = not measured. */
  readonly uxScore: number | null;
  /** SECURITY_PRIVACY category score. `null` = not measured. */
  readonly securityScore: number | null;
  /** BUSINESS_READINESS category score. `null` = not measured. */
  readonly businessScore: number | null;
}

/** Questions whose failure means the foundation is missing → FIX_FIRST. */
const FOUNDATION_QUESTIONS: ReadonlySet<LaunchQuestionId> = new Set(['Q1', 'Q2', 'Q3']);
/** Minor questions whose failure means CONDITIONAL (not a hard block). */
const MINOR_QUESTIONS: ReadonlySet<LaunchQuestionId> = new Set(['Q5', 'Q6', 'Q7']);

function scoreAnswer(score: number | null): LaunchAnswer {
  if (score === null) return 'UNKNOWN';
  return score >= LAUNCH_GATE_PASS_THRESHOLD ? 'YES' : 'NO';
}

function q1Readme(e: LaunchGateEvidence): LaunchQuestion {
  const evidence: string[] = [e.hasReadme ? 'README 발견' : 'README 없음'];
  let answer: LaunchAnswer;
  if (!e.hasReadme) {
    answer = 'NO';
  } else if (e.readmeClaimVerified === false) {
    answer = 'NO';
    evidence.push('README의 출시 주장이 실제와 불일치');
  } else {
    answer = 'YES';
    if (e.readmeClaimVerified === true) evidence.push('출시 주장 검증됨');
  }
  return { id: 'Q1', question: 'README가 있고 프로젝트를 설명하는가?', answer, evidence };
}

function q2License(e: LaunchGateEvidence): LaunchQuestion {
  const evidence: string[] = [e.hasLicense ? 'LICENSE 발견' : 'LICENSE 없음'];
  if (e.hasContributing) evidence.push('CONTRIBUTING 발견');
  return {
    id: 'Q2',
    question: '라이선스 파일이 존재하는가?',
    answer: e.hasLicense ? 'YES' : 'NO',
    evidence,
  };
}

function q3CiTests(e: LaunchGateEvidence): LaunchQuestion {
  return {
    id: 'Q3',
    question: 'CI 설정과 테스트가 갖춰져 있는가?',
    answer: e.hasCiConfig && e.hasTests ? 'YES' : 'NO',
    evidence: [
      e.hasCiConfig ? 'CI 설정 발견' : 'CI 설정 없음',
      e.hasTests ? '테스트 디렉터리 발견' : '테스트 디렉터리 없음',
    ],
  };
}

function q4P0(e: LaunchGateEvidence): LaunchQuestion {
  return {
    id: 'Q4',
    question: '출시를 막는 P0 결함이 0건인가?',
    answer: e.p0Count === 0 ? 'YES' : 'NO',
    evidence: [`P0 ${e.p0Count}건`],
  };
}

function q5Deploy(e: LaunchGateEvidence): LaunchQuestion {
  let answer: LaunchAnswer;
  if (!e.deployUrlReachable) {
    answer = 'NO';
  } else if (e.uxScore === null) {
    answer = 'UNKNOWN';
  } else {
    answer = e.uxScore >= LAUNCH_GATE_PASS_THRESHOLD ? 'YES' : 'NO';
  }
  return {
    id: 'Q5',
    question: '배포 URL이 도달 가능하고 UX/접근성 검사를 통과했는가?',
    answer,
    evidence: [
      e.deployUrlReachable ? '배포 URL 도달 가능' : '배포 URL 도달 불가',
      e.uxScore === null ? 'UX 점수 미측정' : `UX_UI ${e.uxScore}점`,
    ],
  };
}

function q6Security(e: LaunchGateEvidence): LaunchQuestion {
  return {
    id: 'Q6',
    question: '보안 점검(SECURITY_PRIVACY)이 양호한가?',
    answer: scoreAnswer(e.securityScore),
    evidence: [
      e.securityScore === null
        ? '보안 점수 미측정'
        : `SECURITY_PRIVACY ${e.securityScore}점 (기준 ${LAUNCH_GATE_PASS_THRESHOLD})`,
    ],
  };
}

function q7Business(e: LaunchGateEvidence): LaunchQuestion {
  return {
    id: 'Q7',
    question: '비즈니스 출시 준비(BUSINESS_READINESS)가 갖춰졌는가?',
    answer: scoreAnswer(e.businessScore),
    evidence: [
      e.businessScore === null
        ? '비즈니스 준비도 미측정'
        : `BUSINESS_READINESS ${e.businessScore}점 (기준 ${LAUNCH_GATE_PASS_THRESHOLD})`,
    ],
  };
}

/**
 * Derive the 4-state verdict from the answered questions. Precedence (highest
 * first) — a single NO can drive the whole verdict, mirroring CBH's gate:
 *   1. Q4 NO (P0 present)        → BLOCK
 *   2. any foundation (Q1–Q3) NO → FIX_FIRST
 *   3. any minor (Q5–Q7) NO      → CONDITIONAL
 *   4. all seven YES             → READY
 *   5. otherwise (UNKNOWN, no NO) → CONDITIONAL
 */
function deriveVerdict(questions: ReadonlyArray<LaunchQuestion>): LaunchVerdict {
  const byId = new Map(questions.map((qq) => [qq.id, qq.answer]));
  if (byId.get('Q4') === 'NO') return 'BLOCK';
  const foundationFailed = questions.some(
    (qq) => FOUNDATION_QUESTIONS.has(qq.id) && qq.answer === 'NO',
  );
  if (foundationFailed) return 'FIX_FIRST';
  const minorFailed = questions.some(
    (qq) => MINOR_QUESTIONS.has(qq.id) && qq.answer === 'NO',
  );
  if (minorFailed) return 'CONDITIONAL';
  if (questions.every((qq) => qq.answer === 'YES')) return 'READY';
  return 'CONDITIONAL';
}

function buildRationale(
  questions: ReadonlyArray<LaunchQuestion>,
  verdict: LaunchVerdict,
): string {
  const yes = questions.filter((qq) => qq.answer === 'YES').length;
  const no = questions.filter((qq) => qq.answer === 'NO').length;
  const unknown = questions.filter((qq) => qq.answer === 'UNKNOWN').length;
  const failedIds = questions
    .filter((qq) => qq.answer === 'NO')
    .map((qq) => qq.id);
  const tally = `7개 출시 질문 중 ${yes} YES / ${no} NO / ${unknown} 미확인`;
  const label = LAUNCH_VERDICT_LABELS_KO[verdict];
  let driver: string;
  switch (verdict) {
    case 'BLOCK':
      driver = 'P0 결함이 존재해 출시를 차단합니다.';
      break;
    case 'FIX_FIRST':
      driver = `기반 항목 미충족(${failedIds.join(', ')}) — 먼저 보완이 필요합니다.`;
      break;
    case 'CONDITIONAL':
      driver =
        no > 0
          ? `보완 권장 항목(${failedIds.join(', ')})이 있으나 출시를 막지는 않습니다.`
          : '일부 검사를 수행하지 못했으나(미확인) 실패한 항목은 없습니다.';
      break;
    case 'READY':
    default:
      driver = '모든 출시 질문을 충족했습니다.';
      break;
  }
  return `${tally} → ${label}. ${driver}`;
}

/**
 * Evaluate the 7-Question Launch Gate. Always returns exactly 7 questions in
 * Q1..Q7 order plus the derived verdict + rationale.
 */
export function evaluateLaunchGate(evidence: LaunchGateEvidence): LaunchGateResult {
  const questions: LaunchQuestion[] = [
    q1Readme(evidence),
    q2License(evidence),
    q3CiTests(evidence),
    q4P0(evidence),
    q5Deploy(evidence),
    q6Security(evidence),
    q7Business(evidence),
  ];
  const verdict = deriveVerdict(questions);
  return { questions, verdict, rationale: buildRationale(questions, verdict) };
}
