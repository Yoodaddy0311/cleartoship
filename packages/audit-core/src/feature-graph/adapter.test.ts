// L-P1-2 (Sprint 4 Wave 2) — feature-graph adapter edge-case tests.
//
// Sibling-located next to `build-graph.ts`. The "adapter" here is
// `buildFeatureGraph`, which adapts a flat list of detected feature
// primitives + findings into a connected `FeatureGraph` (nodes + edges).
//
// PRD-named edge categories vs. actual `FeatureEdgeType` enum:
//   - DEPENDS_ON  → `depends_on`  (1:1 match)
//   - IMPORTS     → `calls_api`   (no `imports` in the enum; `calls_api` is
//                                  the closest source-level dependency edge
//                                  surfaced by the Sprint 1+ analyzers).
// See `packages/shared-types/src/enums.ts` (FeatureEdgeType) — 11 edge types.

import { describe, expect, it } from 'vitest';
import type { Finding } from '@cleartoship/shared-types';
import { FeatureGraphSchema } from '@cleartoship/shared-types';
import {
  buildFeatureGraph,
  type BuildGraphInput,
  type DetectedFeaturePrimitive,
} from './build-graph.js';

function mkPrimitive(over: Partial<DetectedFeaturePrimitive> = {}): DetectedFeaturePrimitive {
  return {
    id: 'page.home',
    type: 'page',
    label: 'Home',
    status: 'complete',
    confidence: 'HIGH',
    risk: null,
    summary: null,
    edges: [],
    ...over,
  };
}

function mkInput(over: Partial<BuildGraphInput> = {}): BuildGraphInput {
  return {
    auditRunId: 'run-1',
    detected: [],
    findings: [],
    ...over,
  };
}

type FindingForGraph = Pick<Finding, 'category' | 'severity' | 'tags'>;

describe('buildFeatureGraph — adapter edge cases', () => {
  it('creates a depends_on edge between two detected primitives', () => {
    const detected: DetectedFeaturePrimitive[] = [
      mkPrimitive({
        id: 'feature.checkout',
        type: 'feature',
        label: 'Checkout',
        edges: [{ target: 'feature.cart', type: 'depends_on' }],
      }),
      mkPrimitive({ id: 'feature.cart', type: 'feature', label: 'Cart' }),
    ];

    const graph = buildFeatureGraph(mkInput({ detected }));

    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({
      source: 'feature.checkout',
      target: 'feature.cart',
      type: 'depends_on',
      status: 'complete',
    });
    // Schema sanity — the adapter must emit a schema-valid graph.
    expect(() => FeatureGraphSchema.parse(graph)).not.toThrow();
  });

  it('captures source-level dependency via calls_api edge (PRD: IMPORTS surrogate)', () => {
    const detected: DetectedFeaturePrimitive[] = [
      mkPrimitive({
        id: 'page.dashboard',
        type: 'page',
        label: 'Dashboard',
        edges: [{ target: 'api.metrics', type: 'calls_api', summary: 'fetch /api/metrics' }],
      }),
      mkPrimitive({ id: 'api.metrics', type: 'api', label: 'GET /api/metrics' }),
    ];

    const graph = buildFeatureGraph(mkInput({ detected }));

    const callEdge = graph.edges.find((e) => e.type === 'calls_api');
    expect(callEdge).toBeDefined();
    expect(callEdge?.source).toBe('page.dashboard');
    expect(callEdge?.target).toBe('api.metrics');
    expect(callEdge?.summary).toBe('fetch /api/metrics');
  });

  it('does not infinite-loop on circular dependency (A → B → A)', () => {
    const detected: DetectedFeaturePrimitive[] = [
      mkPrimitive({
        id: 'feature.a',
        type: 'feature',
        label: 'A',
        edges: [{ target: 'feature.b', type: 'depends_on' }],
      }),
      mkPrimitive({
        id: 'feature.b',
        type: 'feature',
        label: 'B',
        edges: [{ target: 'feature.a', type: 'depends_on' }],
      }),
    ];

    // Current behavior contract: builder is a pure flat-map; cycles produce
    // both edges without traversal, so it must terminate quickly and emit
    // exactly the declared edges. No marker is added — cycle detection is
    // a downstream concern (graph layout / FCS scoring).
    const start = Date.now();
    const graph = buildFeatureGraph(mkInput({ detected }));
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(500);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(2);
    const pairs = graph.edges.map((e) => `${e.source}->${e.target}`).sort();
    expect(pairs).toEqual(['feature.a->feature.b', 'feature.b->feature.a']);
    // Edge ids must remain unique even on cycles.
    const ids = new Set(graph.edges.map((e) => e.id));
    expect(ids.size).toBe(graph.edges.length);
  });

  it('returns an empty graph (no nodes, no edges) on empty input', () => {
    const graph = buildFeatureGraph(mkInput());

    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
    expect(graph.id).toBe('main');
    expect(graph.auditRunId).toBe('run-1');
    expect(graph.summary).toContain('총 0개');
    expect(graph.summary).toContain('P0 이슈는 없습니다');
    expect(() => FeatureGraphSchema.parse(graph)).not.toThrow();
  });

  it('preserves duplicate edges with unique ids (current contract — no dedup)', () => {
    // The adapter is a flat-map, not a set-builder. Two declarations of the
    // same (source, target, type) produce two distinct edges. Downstream
    // consumers (renderer, FCS) are responsible for merging if desired.
    const detected: DetectedFeaturePrimitive[] = [
      mkPrimitive({
        id: 'page.home',
        type: 'page',
        label: 'Home',
        edges: [
          { target: 'api.user', type: 'calls_api', summary: 'first call site' },
          { target: 'api.user', type: 'calls_api', summary: 'second call site' },
        ],
      }),
      mkPrimitive({ id: 'api.user', type: 'api', label: 'GET /api/user' }),
    ];

    const graph = buildFeatureGraph(mkInput({ detected }));

    const userEdges = graph.edges.filter(
      (e) => e.source === 'page.home' && e.target === 'api.user',
    );
    expect(userEdges).toHaveLength(2);
    expect(new Set(userEdges.map((e) => e.id)).size).toBe(2);
    expect(userEdges.map((e) => e.summary)).toEqual(['first call site', 'second call site']);
  });

  it('rolls up P0 finding count into the graph summary', () => {
    const findings: FindingForGraph[] = [
      { category: 'BACKEND_API', severity: 'P0', tags: [] },
      { category: 'SECURITY_PRIVACY', severity: 'P1', tags: [] },
    ];
    const graph = buildFeatureGraph(
      mkInput({ detected: [mkPrimitive()], findings }),
    );

    expect(graph.summary).toContain('P0 이슈 1개');
  });

  it('derives edge status from source node status when not explicitly set', () => {
    const detected: DetectedFeaturePrimitive[] = [
      mkPrimitive({
        id: 'feature.broken',
        type: 'feature',
        label: 'Broken',
        status: 'missing_connection',
        edges: [{ target: 'api.gone', type: 'calls_api' }],
      }),
      mkPrimitive({
        id: 'api.gone',
        type: 'api',
        label: 'Missing API',
        status: 'missing',
      }),
    ];

    const graph = buildFeatureGraph(mkInput({ detected }));
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]?.status).toBe('missing_connection');
  });
});
