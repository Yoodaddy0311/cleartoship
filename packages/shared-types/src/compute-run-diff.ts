// T2.5 — pure diff between two audit runs.
//
// Lives in shared-types so the web component, future server-side renderer,
// and downstream tooling all import the same algorithm. No Firestore, no
// React, no DOM — just data in → data out.

import type { AuditReport, CategoryScore, Finding } from './domain.js';
import type { AuditCategory, Severity } from './enums.js';

export type RunDiffChangeKind = 'added' | 'removed' | 'changed';

export interface FindingChange {
  kind: RunDiffChangeKind;
  /** The finding as seen in the current run (null when the finding was removed). */
  current: Finding | null;
  /** The finding as seen in the previous run (null when the finding was newly added). */
  previous: Finding | null;
  /**
   * Stable identity used to match findings across runs. Defaults to
   * `finding.id`; callers that re-key on (title+category+path) supply their
   * own. Exposed so the UI can use it as a React key.
   */
  matchKey: string;
  /**
   * For "changed" entries, the human-meaningful fields that differ. Empty
   * for added/removed. Used by the UI to render "what shifted".
   */
  changedFields: ReadonlyArray<keyof Finding>;
}

export interface CategoryDelta {
  category: AuditCategory;
  label: string;
  /** Current score (null = N/A). */
  current: number | null;
  /** Previous score (null = N/A). */
  previous: number | null;
  /**
   * `current - previous` when both sides are numeric; `null` when at least
   * one side is N/A — UI renders these as "N/A → 72" or "—" without doing
   * arithmetic on a null.
   */
  delta: number | null;
}

export interface SeverityDelta {
  severity: Severity;
  current: number;
  previous: number;
  delta: number;
}

export interface RunDiff {
  previousRunId: string;
  currentRunId: string;
  /** Score delta. `null` when either side has no report (or score is N/A). */
  scoreDelta: number | null;
  currentScore: number | null;
  previousScore: number | null;
  categoryDeltas: CategoryDelta[];
  severityDeltas: SeverityDelta[];
  findingChanges: FindingChange[];
  totals: {
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
  };
}

export interface ComputeRunDiffInput {
  previousRunId: string;
  currentRunId: string;
  previousReport: AuditReport | null;
  currentReport: AuditReport | null;
  previousFindings: ReadonlyArray<Finding>;
  currentFindings: ReadonlyArray<Finding>;
  /**
   * Optional custom matcher. Defaults to matching by `finding.id`. Callers
   * with cross-run stable hashes (e.g. semgrep ruleId + path) can pass a
   * custom function so a renamed `id` does not look like added+removed.
   */
  matchKeyOf?: (finding: Finding) => string;
}

const SEVERITIES: readonly Severity[] = ['P0', 'P1', 'P2', 'P3'] as const;

/** Fields that materially change a finding's meaning to a reader. */
const COMPARED_FIELDS: ReadonlyArray<keyof Finding> = [
  'title',
  'category',
  'severity',
  'confidence',
  'status',
  'summary',
  'recommendation',
  'evidenceCount',
];

function nullableScore(score: number | null | undefined): number | null {
  return typeof score === 'number' && Number.isFinite(score) ? score : null;
}

function diffScore(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return current - previous;
}

function indexByMatchKey(
  findings: ReadonlyArray<Finding>,
  matchKeyOf: (f: Finding) => string,
): Map<string, Finding> {
  const out = new Map<string, Finding>();
  for (const f of findings) {
    const key = matchKeyOf(f);
    // First write wins — if the worker emits duplicate ids, only the first
    // is treated as the canonical row. This mirrors Firestore's "doc with
    // this id exists once" guarantee.
    if (!out.has(key)) out.set(key, f);
  }
  return out;
}

function computeChangedFields(prev: Finding, curr: Finding): ReadonlyArray<keyof Finding> {
  const out: Array<keyof Finding> = [];
  for (const field of COMPARED_FIELDS) {
    if (prev[field] !== curr[field]) out.push(field);
  }
  return out;
}

function categoryIndex(scores: ReadonlyArray<CategoryScore>): Map<AuditCategory, CategoryScore> {
  const out = new Map<AuditCategory, CategoryScore>();
  for (const s of scores) out.set(s.category, s);
  return out;
}

function computeCategoryDeltas(
  current: AuditReport | null,
  previous: AuditReport | null,
): CategoryDelta[] {
  const currIdx = categoryIndex(current?.categoryScores ?? []);
  const prevIdx = categoryIndex(previous?.categoryScores ?? []);
  const categories = new Set<AuditCategory>([...currIdx.keys(), ...prevIdx.keys()]);
  const deltas: CategoryDelta[] = [];
  for (const c of categories) {
    const curr = currIdx.get(c) ?? null;
    const prev = prevIdx.get(c) ?? null;
    const currScore = nullableScore(curr?.score ?? null);
    const prevScore = nullableScore(prev?.score ?? null);
    deltas.push({
      category: c,
      label: curr?.label ?? prev?.label ?? c,
      current: currScore,
      previous: prevScore,
      delta: diffScore(currScore, prevScore),
    });
  }
  // Stable order by category enum string to keep snapshots deterministic.
  deltas.sort((a, b) => a.category.localeCompare(b.category));
  return deltas;
}

function computeSeverityDeltas(
  current: AuditReport | null,
  previous: AuditReport | null,
): SeverityDelta[] {
  const c = current?.severityCounts ?? { P0: 0, P1: 0, P2: 0, P3: 0 };
  const p = previous?.severityCounts ?? { P0: 0, P1: 0, P2: 0, P3: 0 };
  return SEVERITIES.map((s) => ({
    severity: s,
    current: c[s],
    previous: p[s],
    delta: c[s] - p[s],
  }));
}

export function computeRunDiff(input: ComputeRunDiffInput): RunDiff {
  const matchKeyOf = input.matchKeyOf ?? ((f: Finding) => f.id);

  const prevIdx = indexByMatchKey(input.previousFindings, matchKeyOf);
  const currIdx = indexByMatchKey(input.currentFindings, matchKeyOf);

  const findingChanges: FindingChange[] = [];
  let added = 0;
  let removed = 0;
  let changed = 0;
  let unchanged = 0;

  // Walk current first → preserves "added/changed" ordering as emitted by
  // the worker (Firestore reads come back ordered).
  for (const [key, curr] of currIdx) {
    const prev = prevIdx.get(key);
    if (!prev) {
      findingChanges.push({
        kind: 'added',
        current: curr,
        previous: null,
        matchKey: key,
        changedFields: [],
      });
      added++;
      continue;
    }
    const changedFields = computeChangedFields(prev, curr);
    if (changedFields.length > 0) {
      findingChanges.push({
        kind: 'changed',
        current: curr,
        previous: prev,
        matchKey: key,
        changedFields,
      });
      changed++;
    } else {
      unchanged++;
    }
  }

  // Anything left in prev that was not seen in current is "removed".
  for (const [key, prev] of prevIdx) {
    if (!currIdx.has(key)) {
      findingChanges.push({
        kind: 'removed',
        current: null,
        previous: prev,
        matchKey: key,
        changedFields: [],
      });
      removed++;
    }
  }

  const currentScore = nullableScore(input.currentReport?.readinessScore ?? null);
  const previousScore = nullableScore(input.previousReport?.readinessScore ?? null);

  return {
    previousRunId: input.previousRunId,
    currentRunId: input.currentRunId,
    scoreDelta: diffScore(currentScore, previousScore),
    currentScore,
    previousScore,
    categoryDeltas: computeCategoryDeltas(input.currentReport, input.previousReport),
    severityDeltas: computeSeverityDeltas(input.currentReport, input.previousReport),
    findingChanges,
    totals: { added, removed, changed, unchanged },
  };
}
