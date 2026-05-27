import type {
  AuditCategory,
  DataModelInventory,
  RouteInventory,
  ScoreOrigin,
} from '@cleartoship/shared-types';

/**
 * Phase 1.3 (Audit Quality Roadmap §4.3) — inventory → baseline category score.
 *
 * Context / reconciliation with PR-A4-fix (2026-05-21):
 *   PR-A4-fix deliberately stopped lifting categories out of N/A from
 *   inventory *existence*, because "there is a GitHub description" ≠ "the
 *   product intent is clear". That reasoning still holds for the LLM-judgment
 *   categories (PRODUCT_INTENT / REQUIREMENT_COVERAGE) — which is exactly why
 *   this module never touches them.
 *
 *   The roadmap's insight is narrower and honest: for the *structural*
 *   categories (FEATURE_GRAPH / FUNCTIONAL_FLOW / DATA_MODEL) a deterministic
 *   file-tree inventory IS a real — if shallow — measurement of structure. So
 *   we assign a MODEST baseline (50–75) that means exactly "structure
 *   detected, quality not yet deeply assessed" rather than the rejected
 *   "inventory exists → free 100". Phase 2's Pattern Library refines these
 *   with actual quality signals.
 *
 *   The baseline is therefore a deterministic (origin 'D') FLOOR, never a
 *   ceiling: it applies only to categories that are otherwise N/A purely
 *   because their `CATEGORY_META.measuredBy` is empty, and any finding that
 *   ever targets the category can only pull the score *below* the baseline
 *   (the caller takes `min(baseline, findingDeductedScore)`).
 */

export interface InventoryBaseline {
  /** Deterministic baseline score (0–100). */
  readonly score: number;
  /** Always 'D' — file-tree structure is deterministic, no LLM/F-API. */
  readonly origin: Extract<ScoreOrigin, 'D'>;
  /** Short human-readable reason, surfaced in logs / future evidence cards. */
  readonly reason: string;
}

/** Route count above which the FEATURE_GRAPH baseline jumps 50 → 70. */
export const FEATURE_GRAPH_RICH_ROUTE_THRESHOLD = 5;
/** Entity count at/above which the DATA_MODEL baseline jumps 60 → 75. */
export const DATA_MODEL_RICH_ENTITY_THRESHOLD = 3;

/**
 * FEATURE_GRAPH baseline from the route inventory.
 *   routes > 5      → 70 ("rich route surface")
 *   1 ≤ routes ≤ 5  → 50 ("route surface detected")
 *   0 routes        → null (genuinely no surface → stays N/A; the UI already
 *                     distinguishes "no routes" via `routeInventory.isEmpty`)
 *
 * Roadmap §4.3 also names a `Link/router edges` signal for the 70 tier.
 * `RouteInventory` does not yet carry edge data (reserved for PR-A3b), so the
 * route count is used as the achievable proxy; the edge refinement is a
 * Phase 2 Pattern Library follow-up.
 */
export function featureGraphBaseline(
  routeInventory: RouteInventory | undefined,
): InventoryBaseline | null {
  if (!routeInventory) return null;
  const routeCount = routeInventory.routes.length;
  if (routeCount === 0) return null;
  if (routeCount > FEATURE_GRAPH_RICH_ROUTE_THRESHOLD) {
    return {
      score: 70,
      origin: 'D',
      reason: `${routeCount} routes detected (rich surface)`,
    };
  }
  return {
    score: 50,
    origin: 'D',
    reason: `${routeCount} route(s) detected`,
  };
}

/**
 * FUNCTIONAL_FLOW baseline. A project with both pages AND at least one dynamic
 * route has navigable, parameterised flows worth a baseline 50. Without
 * dynamic routes we cannot deterministically assert flow structure → stays
 * N/A for Phase 2 patterns (onboarding/auth/checkout flow) to address.
 */
export function functionalFlowBaseline(
  routeInventory: RouteInventory | undefined,
): InventoryBaseline | null {
  if (!routeInventory) return null;
  const { pages, dynamic } = routeInventory.counts;
  if (pages > 0 && dynamic > 0) {
    return {
      score: 50,
      origin: 'D',
      reason: `${pages} page(s), ${dynamic} dynamic route(s)`,
    };
  }
  return null;
}

/**
 * DATA_MODEL baseline from the data-model inventory.
 *   entities ≥ 3              → 75 ("multi-entity model")
 *   tech ≠ none, 1–2 entities → 60 ("schema detected")
 *   tech none / no entities   → null (no DB is an accurate result, surfaced
 *                               via `dataModelInventory.tech === 'none'`)
 */
export function dataModelBaseline(
  dataModelInventory: DataModelInventory | undefined,
): InventoryBaseline | null {
  if (!dataModelInventory) return null;
  if (dataModelInventory.tech === 'none') return null;
  const entityCount = dataModelInventory.entities.length;
  if (entityCount === 0) return null;
  if (entityCount >= DATA_MODEL_RICH_ENTITY_THRESHOLD) {
    return {
      score: 75,
      origin: 'D',
      reason: `${dataModelInventory.tech}: ${entityCount} entities`,
    };
  }
  return {
    score: 60,
    origin: 'D',
    reason: `${dataModelInventory.tech}: ${entityCount} entity(ies)`,
  };
}

/**
 * Build a map of the structural categories this module can baseline-score to
 * the baseline derived from the supplied inventories. Only non-null baselines
 * are included so callers can use a simple `.get(category)` presence check.
 *
 * IMPORTANT: never includes PRODUCT_INTENT / REQUIREMENT_COVERAGE — those are
 * LLM-judgment categories (Phase 3) and must stay N/A under deterministic
 * scoring (see module doc).
 */
export function deriveInventoryBaselines(inventories: {
  readonly routeInventory?: RouteInventory;
  readonly dataModelInventory?: DataModelInventory;
}): Map<AuditCategory, InventoryBaseline> {
  const out = new Map<AuditCategory, InventoryBaseline>();
  const fg = featureGraphBaseline(inventories.routeInventory);
  if (fg) out.set('FEATURE_GRAPH', fg);
  const ff = functionalFlowBaseline(inventories.routeInventory);
  if (ff) out.set('FUNCTIONAL_FLOW', ff);
  const dm = dataModelBaseline(inventories.dataModelInventory);
  if (dm) out.set('DATA_MODEL', dm);
  return out;
}
