import type { RouteInventory } from '@cleartoship/shared-types';
import {
  scoreFromPatterns,
  type PatternEvidence,
  type PatternScoreResult,
} from './score-from-patterns.js';

/**
 * Audit Quality Roadmap §5.3 / §7.1 — FUNCTIONAL_FLOW Pattern Library.
 *
 * Today FUNCTIONAL_FLOW only gets the coarse Phase 1.3 inventory *baseline*
 * (a flat 50 when pages + dynamic routes exist, in `inventory-scoring.ts`).
 * This module upgrades it to a deterministic Pattern-Library score: each
 * pattern is a check over the route inventory's URL paths + counts (+ one
 * optional auth-guard flag the worker derives from detectedFeatures). It NEVER
 * reads file contents, never calls an LLM, never touches the network — so the
 * origin stays 'D'.
 *
 * HONESTY CAVEAT: these are URL-path heuristics. A path named `/checkout`
 * implies a checkout *intent*; it is not proof the checkout flow actually
 * works. The score rates how rich the navigable flow surface looks, not whether
 * any individual flow is correct. The doc says so explicitly.
 *
 * Returns `null` when there are no pages at all — a repo with no navigable
 * surface has no functional flow to score, so the category honestly stays N/A
 * rather than emitting a spurious 50.
 */

export interface FunctionalFlowSignals {
  readonly routeInventory: RouteInventory;
  /** detectedFeatures contains a node of type 'auth_guard' (worker derives). */
  readonly hasAuthGuard?: boolean;
}

/** Authentication entry-point paths (login / signup-as-auth / oauth). */
const AUTH_PATH = /(login|signin|sign-in|auth|register)/i;
/** First-run onboarding / setup paths. */
const ONBOARDING_PATH = /(onboard|welcome|getting-started|signup|sign-up|setup)/i;
/** Commerce / conversion paths. */
const CHECKOUT_PATH = /(checkout|cart|payment|billing|pricing|subscribe)/i;
/** Post-auth surface paths. */
const ACCOUNT_PATH = /(account|profile|settings|dashboard)/i;
/** Error / not-found route, matched against urlPath or sourceFile basename. */
const ERROR_ROUTE = /(error|not-found|404|500)/i;

function basename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] ?? path;
}

/** True when any page route's urlPath matches the given path pattern. */
function anyPagePath(inv: RouteInventory, re: RegExp): boolean {
  return inv.routes.some((r) => r.type === 'page' && re.test(r.urlPath));
}

/** True when any route exposes an error/not-found surface (urlPath or file). */
function hasErrorRoute(inv: RouteInventory): boolean {
  return inv.routes.some(
    (r) => ERROR_ROUTE.test(r.urlPath) || ERROR_ROUTE.test(basename(r.sourceFile)),
  );
}

/** Build the deterministic evidence list. Pure: derives from paths + counts. */
function buildPatterns(
  signals: FunctionalFlowSignals,
): ReadonlyArray<PatternEvidence> {
  const { routeInventory: inv, hasAuthGuard } = signals;
  const { pages, apis, dynamic } = inv.counts;

  const authByGuard = hasAuthGuard === true;
  const authByPath = anyPagePath(inv, AUTH_PATH);
  const onboarding = anyPagePath(inv, ONBOARDING_PATH);
  const checkout = anyPagePath(inv, CHECKOUT_PATH);
  const account = anyPagePath(inv, ACCOUNT_PATH);
  const errorHandling = hasErrorRoute(inv);

  // FF-flat-only RISK: only static pages, no dynamic routes and no APIs — a
  // thin brochure-only surface with no stateful or server-backed flow.
  const flatOnly = dynamic === 0 && apis === 0 && pages > 0;

  return [
    {
      patternId: 'FF-dynamic-flow',
      matched: dynamic > 0,
      scoreImpact: 12,
      evidence: `${dynamic} dynamic route(s) → parameterized, stateful flows`,
    },
    {
      patternId: 'FF-api-backed',
      matched: apis > 0,
      scoreImpact: 10,
      evidence: `${apis} API route(s) → flows backed by server actions`,
    },
    {
      patternId: 'FF-auth-flow',
      matched: authByGuard || authByPath,
      scoreImpact: 12,
      evidence: authByGuard
        ? 'auth_guard feature present → authentication flow'
        : 'a login/auth/register route → authentication flow',
    },
    {
      patternId: 'FF-onboarding',
      matched: onboarding,
      scoreImpact: 8,
      evidence: 'an onboarding/welcome/signup route → first-run flow',
    },
    {
      patternId: 'FF-checkout',
      matched: checkout,
      scoreImpact: 10,
      evidence: 'a checkout/cart/pricing route → commerce/conversion flow',
    },
    {
      patternId: 'FF-account',
      matched: account,
      scoreImpact: 8,
      evidence: 'an account/profile/dashboard route → post-auth surface',
    },
    {
      patternId: 'FF-error-handling',
      matched: errorHandling,
      scoreImpact: 8,
      evidence: 'an error/not-found route → graceful flow handling',
    },
    {
      patternId: 'FF-flat-only',
      matched: flatOnly,
      scoreImpact: -10,
      evidence: 'only static pages, no dynamic routes or APIs → thin brochure-only flow',
    },
  ];
}

export function scoreFunctionalFlow(
  signals: FunctionalFlowSignals,
): PatternScoreResult | null {
  // No pages at all → no navigable flow surface → stay N/A.
  if (signals.routeInventory.counts.pages === 0) {
    return null;
  }
  return scoreFromPatterns(buildPatterns(signals));
}
