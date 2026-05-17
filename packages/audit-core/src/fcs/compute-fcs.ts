import type {
  CategoryScore,
  Concern,
  Confidence,
  FCSResult,
  Finding,
  LaunchStatus,
  Severity,
} from '@cleartoship/shared-types';

/**
 * Wave 1 W1.2 — Founder Confidence Score (FCS) algorithm.
 *
 * Implements PRD §B.1.2 verbatim:
 *   - base = caller-supplied weighted readinessScore (already produced by
 *     calculate-scores so the two surfaces never drift).
 *   - uncertainty = lowConfRatio*20 + indeterminateCats*3, capped at 30.
 *   - lower / upper = base ± uncertainty, clamped to [0, 100].
 *   - topConcerns = up to 3 findings ranked by severityWeight × confidenceWeight.
 *   - status = LaunchStatus 7-enum, re-derived so R-FCS-2 can force
 *     'INDETERMINATE' once uncertainty saturates the 30 cap.
 *   - rationale = deterministic i18n template (No-LLM, ko + en lines).
 *
 * SSOT note (feedback_audit_core_ssot.md): SEVERITY_WEIGHT / CONFIDENCE_WEIGHT
 * are local because audit-core currently exposes ascending-RANK constants
 * (P0=0, HIGH=0) for sort order, not descending impact weights. Defining the
 * inverse here keeps the rank constants single-purpose (sorting) and avoids
 * renaming every existing caller. If a future caller needs the same weights,
 * promote them to a shared module — do not duplicate.
 */

const SEVERITY_WEIGHT: Record<Severity, number> = { P0: 4, P1: 3, P2: 2, P3: 1 };
const CONFIDENCE_WEIGHT: Record<Confidence, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

const UNCERTAINTY_CAP = 30;
const LOW_CONF_RATIO_WEIGHT = 20;
const INDETERMINATE_CAT_WEIGHT = 3;

// R-FCS-2: when uncertainty hits the cap the FCS surface stops asserting a
// verdict; the gauge still renders the numeric `score` but `status` flips to
// INDETERMINATE so the dashboard can show the "분석 자료 부족" chip instead of
// a misleading green/red verdict.
const UNCERTAINTY_INDETERMINATE_THRESHOLD = UNCERTAINTY_CAP;

export interface ComputeFCSInput {
  /** Already-computed weighted readiness score (0~100). */
  readonly baseScore: number;
  /** Per-category breakdown. `score === null` is treated as INDETERMINATE. */
  readonly categoryScores: ReadonlyArray<CategoryScore>;
  /** Open findings considered for uncertainty + topConcerns. */
  readonly findings: ReadonlyArray<
    Pick<Finding, 'id' | 'category' | 'severity' | 'confidence' | 'tags'>
  >;
  /** Pre-derived launch status from calculate-scores (used as fallback). */
  readonly baseStatus: LaunchStatus;
  /** Profile id (landing / saas / ecommerce / null) — drives rationale phrasing. */
  readonly profileId?: string | null;
}

export function computeFCS(input: ComputeFCSInput): FCSResult {
  const { baseScore, categoryScores, findings, baseStatus, profileId } = input;

  const lowConfCount = findings.filter((f) => f.confidence === 'LOW').length;
  // PRD pseudocode divides by `findings.length`; guard the zero-findings happy
  // path so we report uncertainty=0 instead of NaN.
  const lowConfRatio = findings.length === 0 ? 0 : lowConfCount / findings.length;
  const indeterminateCats = categoryScores.filter((s) => s.score === null).length;

  const uncertainty = Math.min(
    UNCERTAINTY_CAP,
    lowConfRatio * LOW_CONF_RATIO_WEIGHT + indeterminateCats * INDETERMINATE_CAT_WEIGHT,
  );

  const lower = Math.max(0, baseScore - uncertainty);
  const upper = Math.min(100, baseScore + uncertainty);

  const topConcerns = pickTopConcerns(findings);
  const status = deriveStatus(baseStatus, uncertainty);
  const rationale = renderRationale(status, topConcerns[0], profileId ?? null);

  return {
    score: Math.round(baseScore),
    lower: Math.round(lower),
    upper: Math.round(upper),
    uncertainty: Math.round(uncertainty),
    status,
    topConcerns,
    rationale,
  };
}

function pickTopConcerns(
  findings: ReadonlyArray<
    Pick<Finding, 'id' | 'category' | 'severity' | 'confidence' | 'tags'>
  >,
): Concern[] {
  // Per PRD §B.1.2 step 4: P0/P1 only, ranked by severity × confidence weight.
  // P2/P3 are deliberately excluded so the dashboard's "highest-impact" pill
  // never surfaces long-tail polish items.
  return findings
    .filter((f) => f.severity === 'P0' || f.severity === 'P1')
    .map((f) => ({
      findingId: f.id,
      severity: f.severity,
      confidence: f.confidence,
      impact: SEVERITY_WEIGHT[f.severity] * CONFIDENCE_WEIGHT[f.confidence],
      ruleFamily: buildRuleFamily(f.category, f.tags),
    }))
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 3);
}

function buildRuleFamily(category: string, tags: ReadonlyArray<string>): string {
  // Convention from shared-types/fcs.test.ts fixture: `${category}/${tagHint}`.
  // Falls back to `${category}/general` so the schema's `min(1)` always holds.
  const tagHint = tags[0] ?? 'general';
  return `${category}/${tagHint}`;
}

function deriveStatus(baseStatus: LaunchStatus, uncertainty: number): LaunchStatus {
  // R-FCS-2: once uncertainty saturates the 30 cap we cannot assert a
  // confident verdict — flip to INDETERMINATE regardless of `baseStatus`.
  // BLOCKED short-circuits ahead of this (audit aborted by a guardrail) so
  // we never overwrite it.
  if (baseStatus === 'BLOCKED') return baseStatus;
  if (uncertainty >= UNCERTAINTY_INDETERMINATE_THRESHOLD) return 'INDETERMINATE';
  return baseStatus;
}

/**
 * No-LLM i18n rationale. Returns one ko + one en sentence joined by ` / ` so
 * the dashboard can split on the delimiter (i18n keys are owned by W1.4 UI).
 * Length caps from PRD §C.2: ko ≤ 90자, en ≤ 140자.
 */
function renderRationale(
  status: LaunchStatus,
  worst: Concern | undefined,
  profileId: string | null,
): string {
  const profileLabel = profileId ? `[${profileId}] ` : '';
  const concernKo = worst ? ` 최우선: ${worst.severity}/${worst.confidence}.` : '';
  const concernEn = worst ? ` Top: ${worst.severity}/${worst.confidence}.` : '';
  const ko = `${profileLabel}${STATUS_LABEL_KO[status]}.${concernKo}`;
  const en = `${profileLabel}${STATUS_LABEL_EN[status]}.${concernEn}`;
  return `${ko} / ${en}`;
}

const STATUS_LABEL_KO: Record<LaunchStatus, string> = {
  READY: '출시 준비 양호',
  CONDITIONAL: '조건부 출시 가능',
  NEEDS_WORK: '출시 전 보완 필요',
  AT_RISK: '위험',
  NOT_READY: '출시 부적합',
  INDETERMINATE: '판단 불가 (분석 자료 부족)',
  BLOCKED: '감사 중단 (가드레일 작동)',
};

const STATUS_LABEL_EN: Record<LaunchStatus, string> = {
  READY: 'Ready to ship',
  CONDITIONAL: 'Conditional ship',
  NEEDS_WORK: 'Polish before ship',
  AT_RISK: 'At risk',
  NOT_READY: 'Not ready',
  INDETERMINATE: 'Insufficient signal',
  BLOCKED: 'Audit blocked',
};
