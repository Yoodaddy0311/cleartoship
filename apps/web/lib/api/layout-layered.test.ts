// Unit tests for the deterministic LAYERED feature-graph layout.
// Pure function: no mocks — call with FeatureNode fixtures and assert rank
// ordering (top→bottom), horizontal determinism, and edge-case handling.

import { describe, expect, it } from 'vitest';
import { layoutLayered } from './layout-layered';
import type { FeatureNode } from '@cleartoship/shared-types';

function makeNode(over: Partial<FeatureNode> & { id: string }): FeatureNode {
  return {
    type: 'page',
    label: over.id,
    status: 'complete',
    risk: null,
    confidence: 'HIGH',
    summary: null,
    evidenceIds: [],
    tags: [],
    ...over,
  };
}

function y(map: Map<string, { x: number; y: number }>, id: string): number {
  const pos = map.get(id);
  if (!pos) throw new Error(`no position for ${id}`);
  return pos.y;
}

describe('layoutLayered', () => {
  it('returns an empty map for empty input', () => {
    expect(layoutLayered([]).size).toBe(0);
  });

  it('ranks top→bottom: page < component < action/api < data_model (by y)', () => {
    const out = layoutLayered([
      makeNode({ id: 'pg', type: 'page' }),
      makeNode({ id: 'cmp', type: 'component' }),
      makeNode({ id: 'act', type: 'action' }),
      makeNode({ id: 'api', type: 'api' }),
      makeNode({ id: 'dm', type: 'data_model' }),
    ]);
    expect(y(out, 'pg')).toBeLessThan(y(out, 'cmp'));
    expect(y(out, 'cmp')).toBeLessThan(y(out, 'act'));
    // action and api share rank 2 → same y.
    expect(y(out, 'act')).toBe(y(out, 'api'));
    expect(y(out, 'api')).toBeLessThan(y(out, 'dm'));
  });

  it('places external_service and auth_guard on the action/api rank', () => {
    const out = layoutLayered([
      makeNode({ id: 'api', type: 'api' }),
      makeNode({ id: 'ext', type: 'external_service' }),
      makeNode({ id: 'guard', type: 'auth_guard' }),
    ]);
    expect(y(out, 'ext')).toBe(y(out, 'api'));
    expect(y(out, 'guard')).toBe(y(out, 'api'));
  });

  it('places unknown/other types on a trailing rank below data_model', () => {
    const out = layoutLayered([
      makeNode({ id: 'dm', type: 'data_model' }),
      makeNode({ id: 'rec', type: 'recommended_feature' }),
      makeNode({ id: 'st', type: 'state' }),
    ]);
    expect(y(out, 'rec')).toBeGreaterThan(y(out, 'dm'));
    expect(y(out, 'st')).toBeGreaterThan(y(out, 'dm'));
  });

  it('is deterministic: same input → identical output', () => {
    const nodes = [
      makeNode({ id: 'b', type: 'component' }),
      makeNode({ id: 'a', type: 'component' }),
      makeNode({ id: 'pg', type: 'page' }),
    ];
    const first = layoutLayered(nodes);
    const second = layoutLayered(nodes);
    expect([...second.entries()]).toEqual([...first.entries()]);
  });

  it('sorts within a rank by id ascending (smaller id → smaller x)', () => {
    const out = layoutLayered([
      makeNode({ id: 'cmp-z', type: 'component' }),
      makeNode({ id: 'cmp-a', type: 'component' }),
    ]);
    expect(out.get('cmp-a')!.x).toBeLessThan(out.get('cmp-z')!.x);
  });

  it('does not mutate the input array', () => {
    const nodes = [
      makeNode({ id: 'z', type: 'component' }),
      makeNode({ id: 'a', type: 'component' }),
    ];
    const snapshot = nodes.map((n) => n.id);
    layoutLayered(nodes);
    expect(nodes.map((n) => n.id)).toEqual(snapshot);
  });

  it('centers narrower ranks relative to the widest rank', () => {
    // rank 1 (components) has 3 nodes → widest; rank 0 (page) has 1 node.
    const out = layoutLayered([
      makeNode({ id: 'pg', type: 'page' }),
      makeNode({ id: 'c1', type: 'component' }),
      makeNode({ id: 'c2', type: 'component' }),
      makeNode({ id: 'c3', type: 'component' }),
    ]);
    const componentXs = ['c1', 'c2', 'c3'].map((id) => out.get(id)!.x);
    const componentCenter =
      (Math.min(...componentXs) + Math.max(...componentXs)) / 2;
    // The single page node should be horizontally centered over the row.
    expect(out.get('pg')!.x).toBeCloseTo(componentCenter, 5);
  });
});
