import { describe, it, expect } from 'vitest';
import type { GraphNode } from './build-nodes.js';
import type { ExtractedEdge } from './extract-edges.js';
import { deriveNodeStatus } from './derive-status.js';

function node(id: string, type: GraphNode['type']): GraphNode {
  return { id, type, label: id, status: 'partial', confidence: 'MEDIUM', summary: null };
}

function edgeMap(
  entries: ReadonlyArray<[string, ReadonlyArray<ExtractedEdge>]>,
): Map<string, ReadonlyArray<ExtractedEdge>> {
  return new Map(entries);
}

describe('deriveNodeStatus', () => {
  it('marks a page with no backend-reaching edge as ui_only', () => {
    const nodes = [node('page.x', 'page')];
    const out = deriveNodeStatus(nodes, edgeMap([['page.x', [{ target: 'component.y', type: 'contains' }]]]));
    expect(out.find((n) => n.id === 'page.x')!.status).toBe('ui_only');
  });

  it('marks a page that calls_api as complete', () => {
    const nodes = [node('page.x', 'page'), node('api.y', 'api')];
    const out = deriveNodeStatus(
      nodes,
      edgeMap([
        ['page.x', [{ target: 'api.y', type: 'calls_api' }]],
        ['api.y', [{ target: 'data_model.Z', type: 'reads_from' }]],
      ]),
    );
    expect(out.find((n) => n.id === 'page.x')!.status).toBe('complete');
  });

  it('marks a page with a missing_link as partial (renders but reaches a missing target)', () => {
    const nodes = [node('page.x', 'page')];
    const out = deriveNodeStatus(
      nodes,
      edgeMap([['page.x', [{ target: 'missing.api.ghost', type: 'missing_link' }]]]),
    );
    expect(out.find((n) => n.id === 'page.x')!.status).toBe('partial');
  });

  it('marks an api/action with no inbound caller as logic_only', () => {
    const nodes = [node('api.orphan', 'api'), node('page.x', 'page')];
    // page.x exists but never calls api.orphan.
    const out = deriveNodeStatus(nodes, edgeMap([['page.x', [{ target: 'component.c', type: 'contains' }]]]));
    expect(out.find((n) => n.id === 'api.orphan')!.status).toBe('logic_only');
  });

  it('marks an api WITH an inbound caller as complete', () => {
    const nodes = [node('api.used', 'api'), node('page.x', 'page')];
    const out = deriveNodeStatus(nodes, edgeMap([['page.x', [{ target: 'api.used', type: 'calls_api' }]]]));
    expect(out.find((n) => n.id === 'api.used')!.status).toBe('complete');
  });

  it('leaves data_model / external_service / auth_guard nodes untouched', () => {
    const nodes = [node('data_model.Post', 'data_model'), node('auth_guard.middleware', 'auth_guard')];
    const out = deriveNodeStatus(nodes, edgeMap([]));
    expect(out.find((n) => n.id === 'data_model.Post')!.status).toBe('partial');
    expect(out.find((n) => n.id === 'auth_guard.middleware')!.status).toBe('partial');
  });

  it("preserves status='missing' on an api node (extractor-created missing target must NOT be downgraded to logic_only)", () => {
    // Simulates the missing api node scanFetches creates when a page fetches
    // an unresolved URL. The missing_link edge target is this node, but
    // missing_link is not in BACKEND_REACHING, so inboundCallers stays empty —
    // the old logic incorrectly downgraded this to 'logic_only' and the canvas
    // lost its gap visualisation. The status MUST survive derivation.
    const missingApi: GraphNode = {
      id: 'missing.api.ghost',
      type: 'api',
      label: '/api/ghost (미구현 추정)',
      status: 'missing',
      confidence: 'LOW',
      summary: null,
    };
    const nodes = [node('page.x', 'page'), missingApi];
    const out = deriveNodeStatus(
      nodes,
      edgeMap([['page.x', [{ target: 'missing.api.ghost', type: 'missing_link' }]]]),
    );
    expect(out.find((n) => n.id === 'missing.api.ghost')!.status).toBe('missing');
    // The page itself still gets the standard 'partial' treatment (renders but
    // reaches a missing target) — this exercise verifies the page rule still
    // fires alongside the missing-preservation rule.
    expect(out.find((n) => n.id === 'page.x')!.status).toBe('partial');
  });
});
