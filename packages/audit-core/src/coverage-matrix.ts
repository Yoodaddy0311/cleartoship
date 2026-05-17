// L-P0-5 (USP-2) — PRD Coverage Matrix builder.
//
// Extracts user-readable claims from an uploaded PRD and cross-references each
// claim against the worker's detected features + open findings to produce one
// CoverageMatrixEntry per claim. The output is attached to AuditReport
// .coverageMatrix (optional field on the existing schema, already wired up by
// L-P0-6 in shared-types).
//
// Spec: docs/PRD/appendix-C-coverage-matrix-spec.md §C.5 (algorithm) + §C.6
// (edge cases).
//
// SSOT scope (project_audit_core_ssot memory): claim extraction +
// detector→evidence matching live here. The worker only feeds raw inputs
// (prdText, detectedFeatures, findings, fileTree); the worker never re-derives
// claims or recommendations on its own.

import type {
  CoverageEvidence,
  CoverageMatrixEntry,
  CoverageStatus,
  Finding,
  Severity,
} from '@cleartoship/shared-types';

// Spec §C.6: cap how many claim rows render in the report. The full set is
// kept on the entry array — caller decides whether to truncate when rendering.
export const COVERAGE_MATRIX_CLAIM_CAP = 50;

// Spec §C.5/§C.3: a claim string is capped at 80 chars in the table column,
// but the entry schema allows up to 500 chars so the full sentence is preserved
// for export. Renderer ellipsises at 80.
export const COVERAGE_MATRIX_CLAIM_MAX_CHARS = 500;

// Spec §C.5.2: claims with detector match + P0/P1 finding => 'partial'.
const BLOCKING_SEVERITIES: ReadonlyArray<Severity> = ['P0', 'P1'];

// Bullet markers that introduce a claim line. Both common Markdown bullets and
// numbered list markers are recognized. Lines without a bullet are still
// candidates if they look like a sentence (verb-ish heuristic).
const BULLET_PATTERN = /^\s*(?:[-*+•·]|\d+[.)])\s+/;

// Spec §C.6 — heuristic "is this PRD-like?" filter. We don't outright reject,
// but we lower per-claim confidence to LOW when the heuristic fails. Korean
// 의무형 어미 + English imperative/declarative verbs.
const PRD_SHAPE_KEYWORDS: ReadonlyArray<RegExp> = [
  /(해야|할 수 있어야|지원|제공|구현|처리|적용|구축|연동)/,
  /\b(must|should|can|provide|support|implement|enable|allow|use|integrate)\b/i,
];

export interface ExtractClaimsOptions {
  /** Override the per-matrix claim cap (default: COVERAGE_MATRIX_CLAIM_CAP). */
  readonly maxClaims?: number;
}

export interface ExtractedClaim {
  /** Normalized claim sentence (whitespace collapsed, bullet stripped). */
  readonly text: string;
  /** Lowercase no-whitespace key used for dedup. */
  readonly normalizedKey: string;
  /** True when at least one PRD_SHAPE_KEYWORDS pattern matches the line. */
  readonly looksLikePrd: boolean;
}

/**
 * Pull candidate claims out of a PRD body. Pure string operation — no I/O.
 *
 * Algorithm:
 *   1. Split on newlines.
 *   2. Keep lines that start with a bullet OR look like a complete sentence
 *      (≥10 chars after trimming, no leading `#` heading marker).
 *   3. Normalize (strip bullet, collapse spaces, drop trailing punctuation).
 *   4. Dedup by `normalizedKey`.
 *   5. Cap to maxClaims (default 50, per §C.6 row cap).
 *
 * Returns `[]` for empty/null input — caller treats that as "no Coverage
 * Matrix section in the report" (§C.6 PRD 0 claim edge case).
 */
export function extractClaims(
  prdText: string | null | undefined,
  options: ExtractClaimsOptions = {},
): ReadonlyArray<ExtractedClaim> {
  if (!prdText) return [];
  const cap = options.maxClaims ?? COVERAGE_MATRIX_CLAIM_CAP;

  const seen = new Set<string>();
  const out: ExtractedClaim[] = [];

  for (const rawLine of prdText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (line.startsWith('#')) continue; // Markdown heading — not a claim.
    if (line.startsWith('==') || line.startsWith('--')) continue; // setext underline.

    const isBulleted = BULLET_PATTERN.test(rawLine);
    const stripped = line.replace(BULLET_PATTERN, '').trim();
    if (stripped.length < 10) continue;

    // Non-bulleted lines must look like prose, not a one-word title.
    if (!isBulleted && !PRD_SHAPE_KEYWORDS.some((re) => re.test(stripped))) {
      continue;
    }

    const normalized = stripped
      .replace(/\s+/g, ' ')
      .replace(/[.。!?]+$/u, '')
      .trim();
    if (normalized.length === 0) continue;
    if (normalized.length > COVERAGE_MATRIX_CLAIM_MAX_CHARS) continue;

    const key = normalized.toLowerCase().replace(/\s+/g, '');
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      text: normalized,
      normalizedKey: key,
      looksLikePrd: PRD_SHAPE_KEYWORDS.some((re) => re.test(normalized)),
    });

    if (out.length >= cap) break;
  }

  return out;
}

/**
 * Hints the worker hands the matcher when it can't ship full detectorResults.
 * Each entry maps a "feature" (label string) to the primary code path that
 * implements it. The matcher uses `keywords` to associate claims with features
 * — these are the lowercased tokens that survived stop-word filtering.
 */
export interface DetectedFeatureHint {
  /** Stable id from `state.detectedFeatures[].id`. */
  readonly id: string;
  /** Human label ("Stripe payment", "OAuth login", …). */
  readonly label: string;
  /** Primary file path (used as `CoverageEvidence.path`). */
  readonly primaryPath: string;
  /** Pre-tokenized lowercase keywords for claim↔feature matching. */
  readonly keywords: ReadonlyArray<string>;
}

export interface BuildCoverageMatrixInput {
  readonly prdText: string | null | undefined;
  readonly detectedFeatures: ReadonlyArray<DetectedFeatureHint>;
  readonly findings: ReadonlyArray<Finding>;
  readonly fileTree?: ReadonlyArray<string>;
  /** When true, LLM fuzzy fallback is conceptually available (T3.3 stub). */
  readonly hasLLM?: boolean;
  readonly maxClaims?: number;
}

/**
 * Build the per-claim Coverage Matrix.
 *
 * Spec §C.5.1 algorithm, with two adaptations for the current pipeline state:
 *
 *   - "DetectorResult" is approximated by DetectedFeatureHint (worker derives
 *     these from `state.detectedFeatures`). The `keywords` field replaces
 *     `measuredBy`/featureKey, since the worker doesn't yet emit a stable
 *     featureKey per detector.
 *
 *   - LLM fuzzy match (§C.5 step 2.a) is a stub — when `hasLLM=false` (the
 *     current default), the unmatched-claim branch always returns 'unclear'.
 *     The shape is preserved so the future T3.3 work only needs to flip
 *     `hasLLM`.
 *
 * Returns an empty array when no claims are extracted — the renderer omits the
 * section entirely per §C.6 (PRD 0 claim).
 */
export function buildCoverageMatrix(
  input: BuildCoverageMatrixInput,
): ReadonlyArray<CoverageMatrixEntry> {
  const claims = extractClaims(input.prdText, { maxClaims: input.maxClaims });
  if (claims.length === 0) return [];

  return claims.map((claim) => matchClaim(claim, input));
}

function matchClaim(
  claim: ExtractedClaim,
  input: BuildCoverageMatrixInput,
): CoverageMatrixEntry {
  const matchedFeature = findFeatureForClaim(claim, input.detectedFeatures);

  if (!matchedFeature) {
    // Spec §C.5 step 2 — detector miss.
    if (input.hasLLM) {
      // LLM is conceptually available but the actual fuzzy matcher hasn't
      // shipped yet (T3.3). Surface as 'unclear' until the adapter lands —
      // never invent a confidence we didn't compute.
      return baseEntry(claim, 'unclear', [], '구현 또는 PRD 수정');
    }
    return baseEntry(claim, 'unclear', [], '구현 또는 PRD 수정');
  }

  // Spec §C.5 step 3 — detector hit, check blocking findings.
  const blockingFindings = findBlockingFindingsForFeature(
    matchedFeature,
    input.findings,
  );

  if (blockingFindings.length === 0) {
    return baseEntry(
      claim,
      'fulfilled',
      [{ type: 'file', path: matchedFeature.primaryPath }],
      undefined,
    );
  }

  const evidence: CoverageEvidence[] = [
    { type: 'file', path: matchedFeature.primaryPath },
    ...blockingFindings.map((f) => ({
      type: 'finding' as const,
      findingId: f.id,
    })),
  ];

  return baseEntry(
    claim,
    'partial',
    evidence,
    composeRecommendation(blockingFindings[0]!),
  );
}

function baseEntry(
  claim: ExtractedClaim,
  status: CoverageStatus,
  evidence: ReadonlyArray<CoverageEvidence>,
  recommendation: string | undefined,
): CoverageMatrixEntry {
  return {
    claim: claim.text,
    status,
    evidence: [...evidence],
    recommendation,
    // Status-derived confidence — independent of project_severity_enum
    // confidence axis but reusing the same HIGH/MEDIUM/LOW vocabulary.
    confidence:
      status === 'fulfilled'
        ? claim.looksLikePrd
          ? 'HIGH'
          : 'MEDIUM'
        : status === 'partial'
          ? 'MEDIUM'
          : claim.looksLikePrd
            ? 'MEDIUM'
            : 'LOW',
  };
}

// Words that almost never carry feature signal — drop before keyword overlap.
const STOPWORDS: ReadonlySet<string> = new Set([
  '를',
  '을',
  '이',
  '가',
  '은',
  '는',
  '의',
  '에',
  '와',
  '과',
  '및',
  '도',
  '로',
  '으로',
  '제공',
  '지원',
  '구현',
  '처리',
  '사용자',
  '기능',
  'the',
  'a',
  'an',
  'and',
  'or',
  'to',
  'of',
  'for',
  'with',
  'in',
  'on',
  'by',
  'is',
  'are',
  'must',
  'should',
  'can',
  'will',
  'use',
  'using',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s/\\,.\-_()'"`]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function findFeatureForClaim(
  claim: ExtractedClaim,
  features: ReadonlyArray<DetectedFeatureHint>,
): DetectedFeatureHint | null {
  if (features.length === 0) return null;
  // Korean is agglutinative — particles like "이메일과", "비밀번호로" don't
  // split cleanly on whitespace. We tokenize for ASCII matching but also keep
  // the lowercased full claim string for substring (`includes`) checks, which
  // handles the Korean suffix problem without a full morpheme analyzer.
  const claimLower = claim.text.toLowerCase();
  const claimTokens = new Set(tokenize(claim.text));

  let best: { feature: DetectedFeatureHint; score: number } | null = null;
  for (const feature of features) {
    let score = 0;
    for (const kw of feature.keywords) {
      const kwLower = kw.toLowerCase();
      if (claimTokens.has(kwLower) || claimLower.includes(kwLower)) score += 1;
    }
    for (const labelTok of tokenize(feature.label)) {
      if (claimTokens.has(labelTok) || claimLower.includes(labelTok)) score += 1;
    }
    if (score > 0 && (best === null || score > best.score)) {
      best = { feature, score };
    }
  }
  return best ? best.feature : null;
}

function findBlockingFindingsForFeature(
  feature: DetectedFeatureHint,
  findings: ReadonlyArray<Finding>,
): ReadonlyArray<Finding> {
  const featureTokens = new Set([
    ...feature.keywords.map((k) => k.toLowerCase()),
    ...tokenize(feature.label),
  ]);
  return findings.filter((f) => {
    if (!BLOCKING_SEVERITIES.includes(f.severity)) return false;
    const haystack = `${f.title} ${f.summary ?? ''} ${(f.tags ?? []).join(' ')}`;
    const findingTokens = new Set(tokenize(haystack));
    for (const t of findingTokens) {
      if (featureTokens.has(t)) return true;
    }
    return false;
  });
}

function composeRecommendation(finding: Finding): string {
  // Spec §C.5.3 — prefer the finding's own actionHint when present (L-P0-6
  // dictionary). Fall back to the finding.recommendation, then to a generic
  // template. Always one short sentence, ≤100 chars per §C.3.
  const fromHint = finding.actionHint?.text?.trim();
  if (fromHint && fromHint.length > 0) {
    return truncateOneLiner(fromHint, 100);
  }
  const fromRec = finding.recommendation?.trim();
  if (fromRec && fromRec.length > 0) {
    return truncateOneLiner(fromRec, 100);
  }
  return truncateOneLiner(`${finding.title} 해결 필요`, 100);
}

function truncateOneLiner(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}

/**
 * Per-status counts used by the summary line ("✅ 6 / ⚠️ 2 / ❓ 2 (충족률 60%)").
 * Pure function so the renderer can call it without re-walking the entries.
 */
export interface CoverageMatrixSummary {
  readonly total: number;
  readonly fulfilled: number;
  readonly partial: number;
  readonly unclear: number;
  /** 0..1 — `fulfilled / total`, or 0 when total=0 (no DIV/0). */
  readonly fulfillmentRate: number;
}

export function summarizeCoverageMatrix(
  entries: ReadonlyArray<CoverageMatrixEntry>,
): CoverageMatrixSummary {
  const counts = { fulfilled: 0, partial: 0, unclear: 0 };
  for (const e of entries) counts[e.status] += 1;
  const total = entries.length;
  return {
    total,
    fulfilled: counts.fulfilled,
    partial: counts.partial,
    unclear: counts.unclear,
    fulfillmentRate: total === 0 ? 0 : counts.fulfilled / total,
  };
}
