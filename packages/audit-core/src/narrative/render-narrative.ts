// L-P1-3 — Narrative 3-sentence template (Sprint 4 Wave 2 Batch B).
//
// Produces a deterministic, locale-aware 3-sentence summary of the FCS result
// that augments — but does not replace — the existing one-sentence
// `FCSResult.rationale`. The intent is to give vibe coders a slightly richer
// "현황 요약" block on the dashboard without paying an LLM round-trip.
//
// Sentence contract (per Sprint 4 §2.3 L-P1-3 spec):
//   S1: Current state — FCS score + LaunchStatus label.
//   S2: Core concerns — quote up to 2 top concerns by ruleFamily.
//   S3: Next action — status-specific recommended action.
//
// Length caps: ko ≤ 180 chars / en ≤ 300 chars. Truncated with "…" if
// composition exceeds the cap so the UI never has to clip mid-codepoint.
//
// INDETERMINATE branch emphasises insufficient data over a verdict; BLOCKED
// emphasises guardrail abort (clone / scan failure) so users understand the
// audit never reached the regular scoring path.

import type { Concern, FCSResult, LaunchStatus } from '@cleartoship/shared-types';

export type NarrativeLocale = 'ko' | 'en';

export interface RenderNarrativeInput {
  readonly fcs: FCSResult;
  readonly locale: NarrativeLocale;
}

const MAX_LEN: Record<NarrativeLocale, number> = { ko: 180, en: 300 };

// ---------------------------------------------------------------------------
// S1 — current state diagnostic
// ---------------------------------------------------------------------------

const STATUS_DIAGNOSIS_KO: Record<LaunchStatus, (score: number) => string> = {
  READY: (s) => `현재 출시 준비도는 ${s}점으로 양호합니다.`,
  CONDITIONAL: (s) => `현재 출시 준비도는 ${s}점으로 조건부 출시 가능 수준입니다.`,
  NEEDS_WORK: (s) => `현재 출시 준비도는 ${s}점으로 보완이 필요합니다.`,
  AT_RISK: (s) => `현재 출시 준비도는 ${s}점이며 위험 신호가 감지됐습니다.`,
  NOT_READY: (s) => `현재 출시 준비도는 ${s}점으로 출시에 부적합합니다.`,
  INDETERMINATE: () => `분석 표면이 부족해 출시 준비도를 단정할 수 없습니다.`,
  BLOCKED: () => `클론 또는 스캔 단계에서 감사가 중단되어 점수를 계산하지 못했습니다.`,
};

const STATUS_DIAGNOSIS_EN: Record<LaunchStatus, (score: number) => string> = {
  READY: (s) => `Launch readiness is ${s}/100, in healthy shape.`,
  CONDITIONAL: (s) => `Launch readiness is ${s}/100 — shippable with caveats.`,
  NEEDS_WORK: (s) => `Launch readiness is ${s}/100 and needs polish before launch.`,
  AT_RISK: (s) => `Launch readiness is ${s}/100 with risk signals surfacing.`,
  NOT_READY: (s) => `Launch readiness is ${s}/100, not yet fit to ship.`,
  INDETERMINATE: () => `Analysis surface was too thin to assert a verdict.`,
  BLOCKED: () => `Audit aborted during clone or scan, so no score was produced.`,
};

// ---------------------------------------------------------------------------
// S2 — concern listing (max 2 ruleFamily citations)
// ---------------------------------------------------------------------------

function listConcernsKo(concerns: ReadonlyArray<Concern>): string {
  if (concerns.length === 0) {
    return '현재까지 식별된 핵심 우려 사항은 없습니다.';
  }
  const cited = concerns.slice(0, 2).map((c) => c.ruleFamily).join(', ');
  return `핵심 우려 사항은 ${cited}입니다.`;
}

function listConcernsEn(concerns: ReadonlyArray<Concern>): string {
  if (concerns.length === 0) {
    return 'No top concerns have been identified so far.';
  }
  const cited = concerns.slice(0, 2).map((c) => c.ruleFamily).join(', ');
  return `Top concerns are ${cited}.`;
}

// ---------------------------------------------------------------------------
// S3 — next action recommendation
// ---------------------------------------------------------------------------

const STATUS_ACTION_KO: Record<LaunchStatus, string> = {
  READY: '최종 점검 후 출시를 진행하세요.',
  CONDITIONAL: '권장 조건만 보완하면 바로 출시할 수 있습니다.',
  NEEDS_WORK: '우선순위 높은 항목부터 차례로 보완 후 재감사하세요.',
  AT_RISK: '위험 항목을 즉시 점검하고 영향 범위를 확인하세요.',
  NOT_READY: 'P0 차단 이슈부터 해결한 뒤 다시 감사를 돌려주세요.',
  INDETERMINATE: 'PRD/배포 URL을 추가하거나 도구 커버리지를 늘려 재감사하세요.',
  BLOCKED: '저장소 접근 권한과 토큰 설정을 점검한 뒤 다시 시도하세요.',
};

const STATUS_ACTION_EN: Record<LaunchStatus, string> = {
  READY: 'Run one last check and ship.',
  CONDITIONAL: 'Address the listed caveats and you can ship right away.',
  NEEDS_WORK: 'Resolve the highest-priority items first, then re-audit.',
  AT_RISK: 'Review the risky areas immediately and assess impact.',
  NOT_READY: 'Fix the P0 blockers before re-running the audit.',
  INDETERMINATE: 'Add a PRD / deploy URL or widen tool coverage, then re-audit.',
  BLOCKED: 'Verify repository access and token configuration, then retry.',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function renderNarrative(input: RenderNarrativeInput): string {
  const { fcs, locale } = input;
  const score = Math.round(fcs.score);
  const s1 = locale === 'ko'
    ? STATUS_DIAGNOSIS_KO[fcs.status](score)
    : STATUS_DIAGNOSIS_EN[fcs.status](score);
  const s2 = locale === 'ko'
    ? listConcernsKo(fcs.topConcerns)
    : listConcernsEn(fcs.topConcerns);
  const s3 = locale === 'ko'
    ? STATUS_ACTION_KO[fcs.status]
    : STATUS_ACTION_EN[fcs.status];
  const body = `${s1} ${s2} ${s3}`;
  return truncate(body, MAX_LEN[locale]);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}
