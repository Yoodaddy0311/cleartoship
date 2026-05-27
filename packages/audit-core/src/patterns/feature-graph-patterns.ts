import type { RouteInventory, RouteEntry } from '@cleartoship/shared-types';
import {
  scoreFromPatterns,
  type PatternEvidence,
  type PatternScoreResult,
} from './score-from-patterns.js';

/**
 * Audit Quality Roadmap §5.3 — FEATURE_GRAPH Pattern Library.
 *
 * Phase 1.3 (`inventory-scoring.ts`) gave FEATURE_GRAPH a coarse inventory
 * *baseline* (50 / 70 by raw route count). This module supersedes that baseline
 * whenever routes are present, refining it into a full deterministic
 * Pattern-Library score: it weighs the *shape* of the route graph (route
 * density, API surface, parameterized routes, page-tree depth), the §4.3
 * "Link edges" connectivity signal, and a disconnected-graph risk.
 *
 * Everything is derived from `state.routeInventory` plus two optional feature
 * counts the worker already holds (`detectedFeatures` node/edge totals). It
 * NEVER reads file contents, never calls an LLM, never touches the network —
 * every pattern is a deterministic check over data the pipeline already has, so
 * the origin stays 'D'.
 *
 * Returns `null` when there is no graph at all (no routes AND no feature
 * nodes): the category honestly stays N/A ("no feature graph detected") rather
 * than emitting a spurious 50.
 */

export interface FeatureGraphSignals {
  readonly routeInventory: RouteInventory;
  readonly featureNodeCount?: number; // state.detectedFeatures.length
  readonly featureEdgeCount?: number; // sum of detectedFeatures[].edges.length
}

/** routes.length above which the graph counts as a "rich" surface. */
const RICH_ROUTE_COUNT = 5;
/** Page-tree depth at/above which the hierarchy counts as "deep". */
const DEEP_TREE_DEPTH = 3;
/** Page count at/above which a zero-edge graph is flagged disconnected. */
const DISCONNECTED_PAGE_THRESHOLD = 5;

/**
 * URL-path segment depth for one route. Prefers `segments` (already excludes
 * route groups), falling back to the normalised `urlPath`. The root "/" is
 * depth 0.
 */
function routeDepth(route: RouteEntry): number {
  if (route.segments.length > 0) {
    return route.segments.filter((s) => s.kind !== 'group').length;
  }
  return route.urlPath.split('/').filter((s) => s.length > 0).length;
}

/** Deepest page-tree depth across all routes (0 when there are no routes). */
function maxRouteDepth(routes: ReadonlyArray<RouteEntry>): number {
  return routes.reduce((max, r) => Math.max(max, routeDepth(r)), 0);
}

/** Build the deterministic evidence list. Pure: derives everything from signals. */
function buildPatterns(
  signals: FeatureGraphSignals,
): ReadonlyArray<PatternEvidence> {
  const { routeInventory, featureEdgeCount } = signals;
  const { routes, counts } = routeInventory;
  const routeCount = routes.length;
  const edgeCount = featureEdgeCount ?? 0;
  const depth = maxRouteDepth(routes);
  const frameworkCount = Object.keys(counts.byFramework).length;

  // FG-route-count: scale impact by surface size (modest → +6, rich → +14).
  const routeImpact = routeCount > RICH_ROUTE_COUNT ? 14 : routeCount >= 1 ? 6 : 0;

  // FG-page-depth: a deeper page tree implies a richer feature hierarchy.
  const depthImpact = depth >= DEEP_TREE_DEPTH ? 8 : depth === 2 ? 4 : 0;

  // FG-graph-edges: Link/nav edges connect the graph (§4.3). Scale by count.
  const edgeImpact = edgeCount >= 8 ? 12 : edgeCount >= 3 ? 8 : edgeCount >= 1 ? 4 : 0;

  // FG-disconnected RISK: many pages but zero edges → likely disconnected graph.
  const disconnected =
    counts.pages >= DISCONNECTED_PAGE_THRESHOLD && edgeCount === 0;

  return [
    {
      patternId: 'FG-route-count',
      matched: routeCount >= 1,
      scoreImpact: routeImpact,
      evidence:
        routeCount > RICH_ROUTE_COUNT
          ? `${routeCount} routes (rich surface)`
          : `${routeCount} route(s) detected`,
    },
    {
      patternId: 'FG-api-surface',
      matched: counts.apis > 0,
      scoreImpact: 8,
      evidence: `${counts.apis} API endpoint(s) — backend surface present`,
    },
    {
      patternId: 'FG-dynamic-routes',
      matched: counts.dynamic > 0,
      scoreImpact: 6,
      evidence: `${counts.dynamic} dynamic (parameterized) route(s)`,
    },
    {
      patternId: 'FG-page-depth',
      matched: depth >= 2,
      scoreImpact: depthImpact,
      evidence: `page tree ${depth} segment(s) deep`,
    },
    {
      patternId: 'FG-graph-edges',
      matched: edgeCount > 0,
      scoreImpact: edgeImpact,
      evidence: `${edgeCount} feature edge(s) connect the graph (Link/nav)`,
    },
    {
      patternId: 'FG-multi-framework',
      matched: frameworkCount > 1,
      scoreImpact: 4,
      evidence: `${frameworkCount} route conventions (mixed App+Pages router)`,
    },
    {
      patternId: 'FG-disconnected',
      matched: disconnected,
      scoreImpact: -10,
      evidence: `${counts.pages} page(s) but 0 edges — graph likely disconnected`,
    },
  ];
}

/** null when there is no graph at all (no routes AND no feature nodes). */
export function scoreFeatureGraph(
  signals: FeatureGraphSignals,
): PatternScoreResult | null {
  const routeCount = signals.routeInventory.routes.length;
  const nodeCount = signals.featureNodeCount ?? 0;
  // No routes AND no feature nodes → no graph → stay N/A.
  if (routeCount === 0 && nodeCount === 0) {
    return null;
  }
  return scoreFromPatterns(buildPatterns(signals));
}
