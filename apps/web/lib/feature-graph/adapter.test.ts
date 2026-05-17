// Unit tests for the feature-graph node↔finding adapter.
// Pure function: no mocks needed — call with fixtures and assert the join.
//
// Linking contract (per packages/shared-types/src/domain.ts):
//   FeatureNode.evidenceIds ──┐
//                             ├── joined on Evidence.id
//   Evidence.findingId  ──────┘
//
// The adapter inverts the join to produce a `Record<nodeId, findingId[]>`
// that GraphCanvas consumes to decide click behavior.

import { describe, expect, it } from 'vitest';
import { buildFindingIdsByNode } from './adapter';

type AdapterNode = { id: string; evidenceIds?: ReadonlyArray<string> };
type AdapterEvidence = { id: string; findingId: string | null };

describe('buildFindingIdsByNode', () => {
  it('returns an empty record when there are no nodes', () => {
    const result = buildFindingIdsByNode([], [
      { id: 'e1', findingId: 'f1' },
    ]);
    expect(result).toEqual({});
  });

  it('returns an empty record when nodes have no evidenceIds', () => {
    const nodes: AdapterNode[] = [
      { id: 'n1' },
      { id: 'n2', evidenceIds: [] },
    ];
    const result = buildFindingIdsByNode(nodes, [
      { id: 'e1', findingId: 'f1' },
    ]);
    expect(result).toEqual({});
  });

  it('maps a node to its single linked finding', () => {
    const nodes: AdapterNode[] = [{ id: 'n1', evidenceIds: ['e1'] }];
    const evidences: AdapterEvidence[] = [{ id: 'e1', findingId: 'f1' }];
    expect(buildFindingIdsByNode(nodes, evidences)).toEqual({ n1: ['f1'] });
  });

  it('aggregates multiple findings per node and de-duplicates ids', () => {
    const nodes: AdapterNode[] = [
      { id: 'n1', evidenceIds: ['e1', 'e2', 'e3'] },
    ];
    const evidences: AdapterEvidence[] = [
      { id: 'e1', findingId: 'f1' },
      { id: 'e2', findingId: 'f2' },
      // e3 points to f1 again — must NOT produce a duplicate entry.
      { id: 'e3', findingId: 'f1' },
    ];
    const result = buildFindingIdsByNode(nodes, evidences);
    expect(result.n1).toEqual(['f1', 'f2']);
  });

  it('skips evidences whose findingId is null', () => {
    const nodes: AdapterNode[] = [
      { id: 'n1', evidenceIds: ['e1', 'e2'] },
    ];
    const evidences: AdapterEvidence[] = [
      { id: 'e1', findingId: null },
      { id: 'e2', findingId: 'f1' },
    ];
    expect(buildFindingIdsByNode(nodes, evidences)).toEqual({ n1: ['f1'] });
  });

  it('omits a node when its evidence ids match no known evidence', () => {
    // Node references e99, but the evidence list does not contain it. The
    // adapter must not throw and must omit the node from the map (length 0).
    const nodes: AdapterNode[] = [
      { id: 'n1', evidenceIds: ['e99'] },
      { id: 'n2', evidenceIds: ['e1'] },
    ];
    const evidences: AdapterEvidence[] = [{ id: 'e1', findingId: 'f1' }];
    const result = buildFindingIdsByNode(nodes, evidences);
    expect(result).toEqual({ n2: ['f1'] });
    expect(result.n1).toBeUndefined();
  });

  it('handles multiple nodes pointing at overlapping evidences', () => {
    const nodes: AdapterNode[] = [
      { id: 'page-login', evidenceIds: ['e1', 'e2'] },
      { id: 'cmp-loginform', evidenceIds: ['e2'] },
      { id: 'api-admin', evidenceIds: ['e3'] },
    ];
    const evidences: AdapterEvidence[] = [
      { id: 'e1', findingId: 'f-001' },
      { id: 'e2', findingId: 'f-002' },
      { id: 'e3', findingId: 'f-001' },
    ];
    const result = buildFindingIdsByNode(nodes, evidences);
    expect(result).toEqual({
      'page-login': ['f-001', 'f-002'],
      'cmp-loginform': ['f-002'],
      'api-admin': ['f-001'],
    });
  });
});
