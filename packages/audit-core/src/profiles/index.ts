import type { AuditCategory, EvidenceType } from '@cleartoship/shared-types';

/**
 * T2.4 (A1-02-B): Per-domain audit profile templates.
 *
 * Users select a profile when starting an audit to bias the scorer toward the
 * categories that matter most for that domain. The default (no profile) keeps
 * the spec weights from `checklist-mapping.ts` untouched, so legacy callers
 * see identical scores.
 *
 * A profile contributes three pieces of metadata:
 *
 *   1. `emphasizedCategories` — purely advisory. Surfaced in the report so the
 *      reader knows which sections to read first. No effect on score.
 *   2. `weightOverrides` — sparse map applied on top of `CATEGORY_META.weight`.
 *      `applyProfileWeights` does the merge — see that helper for normalisation
 *      semantics (overrides do NOT need to sum to 100; the scorer normalises
 *      by `totalWeight` already).
 *   3. `mandatoryEvidence` — evidence types the report is expected to contain
 *      for this domain. When a mandatory evidence type is missing from the
 *      collected evidence set, the dashboard can surface a "missing evidence"
 *      hint. Scoring is unaffected; this is a UX/coverage signal only.
 *
 * All three lists are READONLY — profiles are constants, never mutated.
 */
export interface AuditProfile {
  readonly id: AuditProfileId;
  readonly displayName: {
    readonly ko: string;
    readonly en: string;
  };
  readonly emphasizedCategories: ReadonlyArray<AuditCategory>;
  readonly weightOverrides: Readonly<Partial<Record<AuditCategory, number>>>;
  readonly mandatoryEvidence: ReadonlyArray<EvidenceType>;
  /**
   * L-P0-7 / USP-1: when true, the W3-F Ghost Button heuristic stage runs
   * unconditionally regardless of repo-level toggles. Only the deterministic
   * portion is forced (T3.8 LLM-assisted ghost detection remains opt-in).
   * Profiles that don't set this leave the default behavior unchanged.
   */
  readonly ghostButtonHeuristicForced?: boolean;
}

/**
 * Profile identifiers. Kept as a string-literal union (not a zod enum) so
 * adding a new profile is a single-file change inside audit-core — schema
 * consumers (e.g. AuditRunSchema.profileId) accept any string and rely on
 * `getProfile` to validate at runtime.
 */
export type AuditProfileId = 'landing' | 'saas' | 'ecommerce' | 'vibe-coded';

const LANDING_PROFILE: AuditProfile = {
  id: 'landing',
  displayName: { ko: '랜딩 페이지', en: 'Landing Page' },
  // Landing pages live or die by first-paint UX and the deploy URL itself —
  // there's typically minimal backend surface, so we underweight backend
  // categories and lean on Lighthouse/axe + design consistency signals.
  emphasizedCategories: ['UX_UI', 'FRONTEND_CODE', 'LAUNCH_READINESS'],
  weightOverrides: {
    UX_UI: 30,
    FRONTEND_CODE: 20,
    LAUNCH_READINESS: 20,
    BACKEND_API: 5,
    DATA_MODEL: 5,
    SECURITY_PRIVACY: 10,
  },
  mandatoryEvidence: ['LIGHTHOUSE', 'AXE', 'SCREENSHOT'],
};

const SAAS_PROFILE: AuditProfile = {
  id: 'saas',
  displayName: { ko: 'SaaS 제품', en: 'SaaS Product' },
  // SaaS audits are dominated by backend/API correctness and auth/data
  // boundaries. UX still matters but the launch-blocking risks are usually
  // server-side, so we shift weight toward BACKEND_API + SECURITY_PRIVACY.
  emphasizedCategories: ['BACKEND_API', 'SECURITY_PRIVACY', 'DATA_MODEL'],
  weightOverrides: {
    BACKEND_API: 25,
    SECURITY_PRIVACY: 25,
    DATA_MODEL: 15,
    UX_UI: 10,
    FRONTEND_CODE: 10,
    FUNCTIONAL_FLOW: 10,
  },
  mandatoryEvidence: ['SEMGREP', 'OSV', 'SECRET_SCAN', 'API'],
};

const ECOMMERCE_PROFILE: AuditProfile = {
  id: 'ecommerce',
  displayName: { ko: '이커머스', en: 'E-commerce' },
  // E-commerce risk concentrates on payment/checkout (risky-functions →
  // BACKEND_API), PII/security, and conversion-critical UX. Both axes need
  // weight, plus mandatory secret-scan + payment-function evidence.
  emphasizedCategories: [
    'BACKEND_API',
    'SECURITY_PRIVACY',
    'UX_UI',
    'FUNCTIONAL_FLOW',
  ],
  weightOverrides: {
    BACKEND_API: 20,
    SECURITY_PRIVACY: 20,
    UX_UI: 20,
    FUNCTIONAL_FLOW: 15,
    DATA_MODEL: 10,
    FRONTEND_CODE: 10,
  },
  mandatoryEvidence: ['SEMGREP', 'OSV', 'SECRET_SCAN', 'LIGHTHOUSE'],
};

const VIBE_CODED_PROFILE: AuditProfile = {
  id: 'vibe-coded',
  displayName: { ko: '바이브 코딩', en: 'Vibe-Coded' },
  // L-P0-7 / USP-1 — AI-paired / hackathon / speedrun output is dominated by
  // half-implemented flows, ghost buttons, and "looks-fine-but-broken" UX.
  // Bias the score toward the categories that surface those patterns and force
  // the W3-F ghost-button heuristic on (T3.8 LLM portion stays opt-in).
  // BUSINESS_READINESS stays weight=0 per the default-pass policy
  // (project_audit_categories — finding-only emit on FAIL).
  // Sum invariant: 20+20+20 + 5*8 + 0 = 100, matches base CATEGORY_META sum.
  emphasizedCategories: ['FUNCTIONAL_FLOW', 'UX_UI', 'LAUNCH_READINESS'],
  weightOverrides: {
    FUNCTIONAL_FLOW: 20,
    UX_UI: 20,
    LAUNCH_READINESS: 20,
    PRODUCT_INTENT: 5,
    REQUIREMENT_COVERAGE: 5,
    FEATURE_GRAPH: 5,
    FRONTEND_CODE: 5,
    BACKEND_API: 5,
    DATA_MODEL: 5,
    SECURITY_PRIVACY: 5,
    MAINTAINABILITY_DOCUMENTATION: 5,
    BUSINESS_READINESS: 0,
  },
  mandatoryEvidence: ['LIGHTHOUSE', 'AXE', 'SCREENSHOT', 'SECRET_SCAN'],
  ghostButtonHeuristicForced: true,
};

/**
 * W3.CLN.1 — Deep-freeze a profile so callers cannot mutate the singleton.
 *
 * The `readonly` modifiers on `AuditProfile` are compile-time only; without
 * a runtime freeze a misbehaving caller could do
 *   `getProfile('saas')!.weightOverrides.BACKEND_API = 99`
 * and corrupt every subsequent audit on the same worker. The `Profile`-level
 * fix in A.4.1 explicitly calls for "deep-freeze processing" so the four
 * profile instances are deterministic regardless of caller behavior.
 *
 * We freeze in three places to cover every reachable nested object:
 *   1. `displayName`  — `{ ko, en }` localisation pair
 *   2. `weightOverrides` — sparse category→weight map
 *   3. the profile object itself (and its readonly arrays)
 *
 * Arrays/sets that are typed `ReadonlyArray<...>` are also frozen so the
 * dashboard can iterate them without an "is this safe to mutate?" check.
 */
function deepFreezeProfile(p: AuditProfile): AuditProfile {
  Object.freeze(p.displayName);
  Object.freeze(p.weightOverrides);
  Object.freeze(p.emphasizedCategories);
  Object.freeze(p.mandatoryEvidence);
  return Object.freeze(p);
}

export const AUDIT_PROFILES: ReadonlyArray<AuditProfile> = Object.freeze([
  deepFreezeProfile(LANDING_PROFILE),
  deepFreezeProfile(SAAS_PROFILE),
  deepFreezeProfile(ECOMMERCE_PROFILE),
  deepFreezeProfile(VIBE_CODED_PROFILE),
]);

const PROFILES_BY_ID = new Map<AuditProfileId, AuditProfile>(
  AUDIT_PROFILES.map((p) => [p.id, p]),
);

/**
 * Resolve a profile id to its definition. Returns `null` when the id is
 * unknown (or undefined) — callers should treat null as "no profile selected"
 * and apply the spec defaults from `CATEGORY_META`.
 *
 * Why null instead of throw: the worker reads `profileId` from a Firestore doc
 * that may have been written by an older client; an unknown id should degrade
 * to default scoring, not crash the run.
 */
export function getProfile(
  id: string | null | undefined,
): AuditProfile | null {
  if (id === null || id === undefined) return null;
  return PROFILES_BY_ID.get(id as AuditProfileId) ?? null;
}

export function isAuditProfileId(value: unknown): value is AuditProfileId {
  return typeof value === 'string' && PROFILES_BY_ID.has(value as AuditProfileId);
}

/**
 * Apply a profile's `weightOverrides` on top of the base spec weights.
 *
 * Semantics:
 *   - Categories NOT mentioned in `weightOverrides` keep their base weight.
 *   - Categories mentioned in `weightOverrides` use the override (including 0,
 *     which is the documented "exclude from weighted average" sentinel).
 *   - When `profile` is null, returns the base map unchanged (legacy callers
 *     who never pass a profile see identical scores).
 *
 * The returned map carries every base category, including those with weight 0
 * — callers can iterate it without dropping any category.
 */
export function applyProfileWeights(
  baseWeights: ReadonlyMap<AuditCategory, number>,
  profile: AuditProfile | null,
): ReadonlyMap<AuditCategory, number> {
  if (!profile) return baseWeights;
  const merged = new Map<AuditCategory, number>(baseWeights);
  for (const [cat, w] of Object.entries(profile.weightOverrides)) {
    if (typeof w === 'number') {
      merged.set(cat as AuditCategory, w);
    }
  }
  return merged;
}
