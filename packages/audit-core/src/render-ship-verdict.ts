// L-P0-3 — Ship Verdict generator (PRD §3.2.1 "한 줄 결론").
//
// SSOT: this file. audit-worker MUST import `renderShipVerdict` (and
// `renderShipVerdictMarkdown`) from `@cleartoship/audit-core` — never inline
// the verdict rules. See feedback_audit_core_ssot.md (CC-117 RULE_FAMILY
// duplication 사례) for the rationale.
//
// Two layers of decision combine to pick the final verdict:
//   1. LaunchStatus(7) → ShipVerdictLevel(4) mapping (this is the
//      backward-compat surface — runs that already produced LaunchStatus
//      pre-L-P0-6 keep producing the same 1줄 결론).
//   2. PRD §3.2.1 finding-driven rules (BLOCKED/NEEDS_WORK/READY_WITH_CAVEATS/
//      READY) — these *escalate* (never demote) the mapped status. Example:
//      a CONDITIONAL run with a HIGH-confidence P0 still ships as BLOCKED.
//
// The function is intentionally pure / LLM-free: the same input always yields
// the same verdict so the §1 header is reproducible across re-runs.

import type {
  CategoryScore,
  Confidence,
  Finding,
  LaunchStatus,
  Severity,
  ShipVerdict,
  ShipVerdictLevel,
} from '@cleartoship/shared-types';
import type { AuditProfile } from './profiles/index.js';
import { applyProfileWeights } from './profiles/index.js';
import { CATEGORY_META } from './scoring/checklist-mapping.js';
import { SEVERITY_LANGUAGE_KO } from './i18n/severity-ko.js';
import type { AuditCategory } from '@cleartoship/shared-types';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RenderShipVerdictInput {
  scores: readonly CategoryScore[];
  findings: readonly Finding[];
  // L-P0-7 vibe-coded 포함. 현재 verdict 규칙은 profile-neutral — reserved
  // for future per-profile escalation (e.g. landing profile downgrading
  // BACKEND_API blockers). Accepting it now keeps the signature stable.
  profile: AuditProfile | null;
  launchStatus: LaunchStatus;
  overallScore: number;
}

/**
 * PRD §3.2.1 threshold: P1 count ≥ this → NEEDS_WORK.
 */
const NEEDS_WORK_P1_THRESHOLD = 5;

/**
 * "HIGH+MEDIUM confidence 비중 ≥70%" for READY (PRD §3.2.1).
 */
const READY_CONFIDENCE_RATIO = 0.7;

const REASON_MAX_CHARS = 280;
const SCORE_MIN = 0;
const SCORE_MAX = 100;
const TITLE_TRIM_CHARS = 60;
const TOP_BLOCKERS_CAP = 3;

const SEVERITY_RANK: Record<Severity, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const CONFIDENCE_RANK: Record<Confidence, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/**
 * LaunchStatus(7단) → ShipVerdictLevel(4단) 매핑 — backward-compat 흡수.
 *
 * | LaunchStatus    | ShipVerdictLevel    | 근거                                    |
 * |-----------------|---------------------|----------------------------------------|
 * | READY           | READY               | 양호 → 즉시 출시 가능                   |
 * | CONDITIONAL     | READY_WITH_CAVEATS  | 조건부 → 사용자 데이터 위협 없음        |
 * | NEEDS_WORK      | NEEDS_WORK          | 보완 필요 (동명)                        |
 * | AT_RISK         | NEEDS_WORK          | 위험 → 보완 필요 흡수                   |
 * | NOT_READY       | BLOCKED             | 출시 부적합 → 차단                      |
 * | INDETERMINATE   | NEEDS_WORK          | 판단 불가 → 보수적으로 보완 (LOW conf)  |
 * | BLOCKED         | BLOCKED             | 가드레일 차단 (동명)                    |
 */
export const LAUNCH_STATUS_TO_SHIP_VERDICT: Readonly<Record<LaunchStatus, ShipVerdictLevel>> = {
  READY: 'READY',
  CONDITIONAL: 'READY_WITH_CAVEATS',
  NEEDS_WORK: 'NEEDS_WORK',
  AT_RISK: 'NEEDS_WORK',
  NOT_READY: 'BLOCKED',
  INDETERMINATE: 'NEEDS_WORK',
  BLOCKED: 'BLOCKED',
};

/** Severity-only ranking used by both verdict tiering and BLOCKED ordering. */
const VERDICT_RANK: Record<ShipVerdictLevel, number> = {
  BLOCKED: 0,
  NEEDS_WORK: 1,
  READY_WITH_CAVEATS: 2,
  READY: 3,
};

export function renderShipVerdict(input: RenderShipVerdictInput): ShipVerdict {
  const { findings, launchStatus, overallScore } = input;

  // Step 1: severity counts from the live findings array.
  const counts = countSeverities(findings);

  // Step 2: PRD §3.2.1 finding-driven verdict.
  const findingDriven = decideFindingVerdict(counts, findings);

  // Step 3: LaunchStatus-mapped verdict.
  const launchMapped = LAUNCH_STATUS_TO_SHIP_VERDICT[launchStatus];

  // Step 4: take the WORSE of the two (lower rank wins). This guarantees a
  // HIGH-conf P0 always escalates a CONDITIONAL run to BLOCKED, while a
  // missing-tools INDETERMINATE never gets downgraded to READY.
  const finalVerdict: ShipVerdictLevel =
    VERDICT_RANK[findingDriven] <= VERDICT_RANK[launchMapped]
      ? findingDriven
      : launchMapped;

  // Step 5: confidence per spec — HIGH ratio ≥70% → HIGH; HIGH+MEDIUM
  // ≥70% → MEDIUM; else LOW. INDETERMINATE forces LOW (per lead spec —
  // "보수적 결론"). Empty findings → HIGH (vacuously confident clean run).
  const confidence =
    launchStatus === 'INDETERMINATE' ? 'LOW' : aggregateConfidence(findings);

  // Step 6: top blockers — severity DESC → confidence DESC → id stable.
  // Sophisticated re-ranking lives in L-P0-4 (#29).
  const topBlockerIds = sortForBlockerSpotlight(findings)
    .slice(0, TOP_BLOCKERS_CAP)
    .map((f) => f.id);

  const reason = buildReason(finalVerdict, counts, findings, launchStatus);
  const score = clampScore(overallScore);

  return {
    verdict: finalVerdict,
    reason,
    score,
    topBlockerIds,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Verdict tiering (PRD §3.2.1)
// ---------------------------------------------------------------------------

function decideFindingVerdict(
  counts: Record<Severity, number>,
  findings: readonly Finding[],
): ShipVerdictLevel {
  const hasHighConfP0 = findings.some(
    (f) => f.severity === 'P0' && f.confidence === 'HIGH',
  );
  if (hasHighConfP0) return 'BLOCKED';

  if (counts.P0 >= 1 || counts.P1 >= NEEDS_WORK_P1_THRESHOLD) return 'NEEDS_WORK';

  if (counts.P1 > 0) return 'READY_WITH_CAVEATS';

  // No P0/P1 — gate READY on overall confidence shape.
  return highOrMediumRatio(findings) >= READY_CONFIDENCE_RATIO
    ? 'READY'
    : 'READY_WITH_CAVEATS';
}

function countSeverities(findings: readonly Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

function highOrMediumRatio(findings: readonly Finding[]): number {
  if (findings.length === 0) return 1;
  const ok = findings.filter((f) => f.confidence !== 'LOW').length;
  return ok / findings.length;
}

function highRatio(findings: readonly Finding[]): number {
  if (findings.length === 0) return 1;
  return findings.filter((f) => f.confidence === 'HIGH').length / findings.length;
}

function aggregateConfidence(findings: readonly Finding[]): Confidence {
  if (highRatio(findings) >= READY_CONFIDENCE_RATIO) return 'HIGH';
  if (highOrMediumRatio(findings) >= READY_CONFIDENCE_RATIO) return 'MEDIUM';
  return 'LOW';
}

// ---------------------------------------------------------------------------
// 1줄 사유 (No-LLM) — verdict 별 한글 template + worst finding 본문 삽입.
// SEVERITY_LANGUAGE_KO 로 P0/P1 라벨을 일관성 있게 가져온다.
// ---------------------------------------------------------------------------

function buildReason(
  verdict: ShipVerdictLevel,
  counts: Record<Severity, number>,
  findings: readonly Finding[],
  launchStatus: LaunchStatus,
): string {
  const worst = sortForBlockerSpotlight(findings)[0] ?? null;
  const worstTitle = worst ? trimTitle(worst.title) : '';
  const worstCategory = worst?.category ?? '';
  const worstSevLabel = worst ? SEVERITY_LANGUAGE_KO[worst.severity].label : '';

  // INDETERMINATE special-case: scoring couldn't measure enough surface to
  // give a real verdict — surface that explicitly so users know it's not a
  // negative judgment but missing inputs.
  if (launchStatus === 'INDETERMINATE') {
    return truncate('NEEDS_WORK — 분석 표면 부족으로 판단 보수적 (도구/배포URL/PRD 보강 필요)');
  }

  let body: string;
  const moreCount = Math.max(0, counts.P0 + counts.P1 - 1);
  const tail = moreCount > 0 ? ` 외 ${moreCount}건 해결 필요` : '';

  switch (verdict) {
    case 'BLOCKED':
      body = worst
        ? `BLOCKED — ${worstCategory} ${worstSevLabel} (${worstTitle})${tail}`
        : `BLOCKED — 출시 차단 이슈 감지${tail}`;
      break;
    case 'NEEDS_WORK':
      if (counts.P0 >= 1 && worst) {
        body = `NEEDS_WORK — ${worstCategory} ${worstSevLabel} (${worstTitle})${tail}`;
      } else if (counts.P1 >= NEEDS_WORK_P1_THRESHOLD) {
        body = worst
          ? `NEEDS_WORK — P1 ${counts.P1}건 누적, ${worstCategory} (${worstTitle}) 부터 보완 필요`
          : `NEEDS_WORK — P1 ${counts.P1}건 누적, 보완 필요`;
      } else {
        body = worst
          ? `NEEDS_WORK — ${worstCategory} ${worstSevLabel} (${worstTitle})`
          : 'NEEDS_WORK — 출시 전 보완 필요';
      }
      break;
    case 'READY_WITH_CAVEATS':
      if (counts.P1 > 0 && worst) {
        body = `READY_WITH_CAVEATS — ${worstCategory} ${worstSevLabel} (${worstTitle}) — 사용자 데이터 위협은 없음`;
      } else {
        body = 'READY_WITH_CAVEATS — P0/P1 없음, 분석 confidence 낮아 보수적 결론';
      }
      break;
    case 'READY':
      body = 'READY — P0/P1 없음, 분석 confidence 충분 — 즉시 출시 가능';
      break;
  }
  return truncate(body);
}

function trimTitle(title: string): string {
  const single = title.replace(/\s+/g, ' ').trim();
  return single.length > TITLE_TRIM_CHARS ? `${single.slice(0, TITLE_TRIM_CHARS - 1)}…` : single;
}

function truncate(s: string): string {
  return s.length > REASON_MAX_CHARS ? `${s.slice(0, REASON_MAX_CHARS - 1)}…` : s;
}

// ---------------------------------------------------------------------------
// sortForBlockerSpotlight — severity → confidence → id stable. Exported so
// L-P0-4 (#29) can reuse the same ordering for the §3 Blocker Spotlight Top-3.
// ---------------------------------------------------------------------------

export function sortForBlockerSpotlight<T extends Pick<Finding, 'severity' | 'confidence' | 'id'>>(
  findings: readonly T[],
): T[] {
  return [...findings].sort((a, b) => {
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (s !== 0) return s;
    const c = CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence];
    if (c !== 0) return c;
    return a.id.localeCompare(b.id);
  });
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return SCORE_MIN;
  const rounded = Math.round(n);
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, rounded));
}

// ---------------------------------------------------------------------------
// Markdown — §1 한 줄 결론 block prepended to renderAuditReportMarkdown header.
// ---------------------------------------------------------------------------

const VERDICT_LABEL_KO: Readonly<Record<ShipVerdictLevel, string>> = {
  READY: '즉시 출시 가능',
  READY_WITH_CAVEATS: '조건부 출시 가능',
  NEEDS_WORK: '출시 전 보완 필요',
  BLOCKED: '출시 차단',
};

const VERDICT_BADGE: Readonly<Record<ShipVerdictLevel, string>> = {
  READY: '🟢',
  READY_WITH_CAVEATS: '🟡',
  NEEDS_WORK: '🟠',
  BLOCKED: '🔴',
};

export interface RenderShipVerdictMarkdownOptions {
  /**
   * Live findings used to enrich the Top-3 Blocker Spotlight box with
   * title + category text. When omitted, the renderer falls back to the
   * id-only summary (backward-compatible with pre-L-P0-4 callers).
   */
  readonly findings?: readonly Finding[];
  /** Optional profile — drives category-weight tie-break in the spotlight. */
  readonly profile?: AuditProfile | null;
}

export function renderShipVerdictMarkdown(
  verdict: ShipVerdict,
  options: RenderShipVerdictMarkdownOptions = {},
): string {
  const lines: string[] = [];
  lines.push('## 한 줄 결론', '');
  lines.push(
    `> ${VERDICT_BADGE[verdict.verdict]} **${VERDICT_LABEL_KO[verdict.verdict]}** · ${verdict.reason}`,
  );
  lines.push('');
  lines.push(`Readiness Score: ${verdict.score}/100 · Confidence: ${verdict.confidence}`);

  const spotlight = buildSpotlightBlock(verdict, options);
  if (spotlight) {
    lines.push('');
    lines.push(spotlight);
  }
  lines.push('');
  return lines.join('\n');
}

function buildSpotlightBlock(
  verdict: ShipVerdict,
  options: RenderShipVerdictMarkdownOptions,
): string | null {
  if (verdict.topBlockerIds.length === 0) return null;

  // Rich path: caller passed findings → render the ① ② ③ box per PRD §3.2.1.
  if (options.findings && options.findings.length > 0) {
    const visible = filterToSpotlight(options.findings, verdict.topBlockerIds);
    const result = selectTopBlockers({
      findings: visible,
      profile: options.profile ?? null,
      max: verdict.topBlockerIds.length,
    });
    const md = renderBlockerSpotlightMarkdown(result);
    if (md) return md;
  }

  // Fallback: id-only one-liner (legacy callers).
  return `Top blockers: ${verdict.topBlockerIds.map((id) => `\`${id}\``).join(', ')}`;
}

function filterToSpotlight(
  findings: readonly Finding[],
  ids: readonly string[],
): Finding[] {
  const set = new Set(ids);
  return findings.filter((f) => set.has(f.id));
}

// ---------------------------------------------------------------------------
// L-P0-4 (#29) — Blocker Spotlight Top-3 selector (PRD §3.2.1).
//
// Picks the 3 most impactful findings to highlight under the §1 한 줄 결론.
// Priority (lead spec):
//   severity DESC → confidence DESC → category weight DESC → createdAt ASC
// P0 부족시 P1 fallback. fillP1Used=true 신호로 UI 헤더에
// "(P0 부재, P1 우선순위로 채움)" 메모(`note`)를 노출.
// ---------------------------------------------------------------------------

export const TOP_BLOCKERS_DEFAULT_MAX = TOP_BLOCKERS_CAP;
const FILL_P1_NOTE = '(P0 부재, P1 우선순위로 채움)';

export interface SelectTopBlockersInput {
  readonly findings: readonly Finding[];
  /** Spotlight cap (default {@link TOP_BLOCKERS_DEFAULT_MAX} = 3). */
  readonly max?: number;
  /** Optional profile — drives category weight overrides for the tie-break. */
  readonly profile?: AuditProfile | null;
}

export interface SelectTopBlockersResult {
  /** Up to `max` findings ordered by spotlight priority. */
  readonly blockers: readonly Finding[];
  /**
   * True iff at least one P1 finding was used to pad the list because P0 alone
   * couldn't fill `max`. UI uses this to render the "(P0 부재, P1 우선순위)" hint.
   */
  readonly fillP1Used: boolean;
  /** Human-readable header note. Present iff `fillP1Used === true`. */
  readonly note?: string;
}

/** Base spec weights keyed by category, used when no profile is supplied. */
const BASE_CATEGORY_WEIGHTS: ReadonlyMap<AuditCategory, number> = new Map(
  CATEGORY_META.map((m) => [m.category, m.weight]),
);

/**
 * Select the top-N blockers for the §3.2.1 Blocker Spotlight.
 *
 * Sort key (DESC severity, DESC confidence, DESC category weight, ASC createdAt):
 *   - severity:    P0 < P1 (we want P0 first)
 *   - confidence:  HIGH < MEDIUM < LOW (we want HIGH first)
 *   - weight:      higher weight wins (profile-aware via applyProfileWeights)
 *   - createdAt:   earlier wins (deterministic tie-break on ISO string)
 *
 * If fewer than `max` P0 findings exist, the remaining slots are filled with
 * P1 findings (same ordering); `fillP1Used` is set to `true` and `note` is
 * populated with the standard 헤더 메모. If even P0+P1 cannot fill `max`, we
 * return as many as we have — no note, no padding from P2/P3.
 */
export function selectTopBlockers(
  input: SelectTopBlockersInput,
): SelectTopBlockersResult {
  const cap = normalizeMax(input.max);
  const weights = applyProfileWeights(BASE_CATEGORY_WEIGHTS, input.profile ?? null);

  const sortByPriority = (list: readonly Finding[]): Finding[] =>
    [...list].sort((a, b) => compareBlockerPriority(a, b, weights));

  const sortedP0 = sortByPriority(input.findings.filter((f) => f.severity === 'P0'));
  const sortedP1 = sortByPriority(input.findings.filter((f) => f.severity === 'P1'));

  if (cap === 0) {
    return { blockers: [], fillP1Used: false };
  }

  if (sortedP0.length >= cap) {
    return { blockers: sortedP0.slice(0, cap), fillP1Used: false };
  }

  const padCount = cap - sortedP0.length;
  const padding = sortedP1.slice(0, padCount);
  const blockers = [...sortedP0, ...padding];
  const fillP1Used = padding.length > 0;

  return fillP1Used
    ? { blockers, fillP1Used: true, note: FILL_P1_NOTE }
    : { blockers, fillP1Used: false };
}

function normalizeMax(max: number | undefined): number {
  if (max === undefined) return TOP_BLOCKERS_DEFAULT_MAX;
  if (!Number.isFinite(max) || max < 0) return 0;
  return Math.floor(max);
}

function compareBlockerPriority(
  a: Finding,
  b: Finding,
  weights: ReadonlyMap<AuditCategory, number>,
): number {
  const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (s !== 0) return s;
  const c = CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence];
  if (c !== 0) return c;
  const wa = weights.get(a.category) ?? 0;
  const wb = weights.get(b.category) ?? 0;
  if (wa !== wb) return wb - wa; // weight DESC
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id.localeCompare(b.id);
}

// ---------------------------------------------------------------------------
// Markdown helpers for the §1 Blocker Spotlight box (PRD §3.2.1 mock).
// Exported so renderShipVerdictMarkdown (and dashboard renderers) can reuse
// the same numeric glyphs without duplicating the layout rules.
// ---------------------------------------------------------------------------

const BLOCKER_NUMERIC_GLYPHS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];
const BLOCKER_TITLE_TRIM = 80;

export function renderBlockerSpotlightMarkdown(
  result: SelectTopBlockersResult,
): string {
  if (result.blockers.length === 0) return '';
  const lines: string[] = ['Top blockers:'];
  if (result.note) lines.push(`> ${result.note}`);
  result.blockers.forEach((f, idx) => {
    const glyph = BLOCKER_NUMERIC_GLYPHS[idx] ?? `(${idx + 1})`;
    lines.push(`- ${glyph} ${trimBlockerTitle(f.title)} (${f.category})`);
  });
  return lines.join('\n');
}

function trimBlockerTitle(title: string): string {
  const single = title.replace(/\s+/g, ' ').trim();
  return single.length > BLOCKER_TITLE_TRIM
    ? `${single.slice(0, BLOCKER_TITLE_TRIM - 1)}…`
    : single;
}
