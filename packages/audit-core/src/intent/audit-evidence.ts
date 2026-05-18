// T1.2 — Audit evidence keys (PoC: README_PRESENT only).
//
// Worker pipeline steps emit boolean facts about the cloned repo into an
// AuditEvidence map. Checklist items declare which key they consume via their
// `measuredBy` field, so the evaluator can resolve PASS/FAIL deterministically
// — eliminating INDETERMINATE for any item whose evidence key is populated.
//
// PoC scope: W1-A1 (README presence) only. Additional keys are listed in the
// `EvidenceKey` union with `// DEFERRED` markers so callers can see what's
// planned but the type system rejects unknown keys today. T1.2 follow-up will
// activate the remaining keys alongside step04/step11 wiring.

/**
 * Stable, machine-readable evidence key. PoC enables only README_PRESENT. The
 * remaining members are reserved IDs (deferred to T1.3 bundle) — types pin the
 * shape now to avoid churn when they activate.
 */
export type EvidenceKey =
  | 'README_PRESENT'
  // DEFERRED to T1.3 bundle (A2-A5):
  | 'PACKAGE_SCRIPTS_PRESENT'
  | 'LICENSE_PRESENT'
  | 'CI_CONFIG_PRESENT'
  | 'TESTS_DIR_PRESENT';

/**
 * Subset of EvidenceKey actually populated by the worker pipeline today.
 * Use this when reasoning about coverage; widen as keys come online.
 */
export const ACTIVE_EVIDENCE_KEYS: ReadonlyArray<EvidenceKey> = ['README_PRESENT'];

/**
 * Evidence collected during pipeline execution. Keys are optional — `undefined`
 * means "no step has emitted a value yet" and resolves to INDETERMINATE.
 * Worker steps set keys to `true`/`false` once they've inspected the repo.
 */
export type AuditEvidence = Partial<Record<EvidenceKey, boolean>>;

export function createEmptyEvidence(): AuditEvidence {
  return {};
}

/** True when the evidence key has been set (regardless of true/false). */
export function hasEvidence(evidence: AuditEvidence, key: EvidenceKey): boolean {
  return evidence[key] !== undefined;
}
