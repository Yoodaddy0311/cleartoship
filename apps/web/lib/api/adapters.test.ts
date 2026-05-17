// Unit tests for adapters between API DTOs (shared-types Firestore-aligned shapes)
// and the UI view-model shapes (FindingViewModel / MockNode / FindingEvidenceView).
// Pure functions: no mocks needed — call with fixtures and assert structural mapping.

import { describe, expect, it } from 'vitest';
import {
  adaptLaunchStatus,
  adaptCategoryScores,
  adaptFinding,
  adaptEvidence,
  adaptFeatureGraph,
} from './adapters';
import type {
  AuditReport,
  Evidence,
  FeatureGraph,
  Finding,
} from '@cleartoship/shared-types';

const ISO = '2026-05-16T05:00:00.000Z';

function makeFinding(over: Partial<Finding> = {}): Finding {
  return {
    id: 'f-1',
    auditRunId: 'run-1',
    title: 'Sample finding',
    category: 'SECURITY_PRIVACY',
    severity: 'P0',
    confidence: 'HIGH',
    status: 'OPEN',
    summary: 'summary',
    nonDeveloperExplanation: 'non-dev explanation',
    technicalExplanation: 'tech explanation',
    impact: 'impact line 1\nimpact line 2',
    recommendation: '- rec 1\n- rec 2\n- rec 3',
    acceptanceCriteria: ['ac 1', 'ac 2'],
    tags: [],
    evidenceCount: 0,
    createdAt: ISO,
    ...over,
  };
}

function makeEvidence(over: Partial<Evidence> = {}): Evidence {
  return {
    id: 'e-1',
    auditRunId: 'run-1',
    findingId: 'f-1',
    type: 'CODE_SNIPPET',
    source: 'static-analyzer',
    path: 'src/index.ts',
    lineStart: 10,
    lineEnd: 20,
    url: null,
    selector: null,
    screenshotPath: null,
    snippet: 'const x = 1;',
    maskedValue: null,
    metadata: null,
    createdAt: ISO,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// adaptLaunchStatus
// ---------------------------------------------------------------------------

describe('adaptLaunchStatus', () => {
  it('maps READY → ready', () => {
    expect(adaptLaunchStatus('READY')).toBe('ready');
  });

  it('maps CONDITIONAL → ready_with_improvements', () => {
    expect(adaptLaunchStatus('CONDITIONAL')).toBe('ready_with_improvements');
  });

  it('maps NEEDS_WORK → needs_work', () => {
    expect(adaptLaunchStatus('NEEDS_WORK')).toBe('needs_work');
  });

  it('maps AT_RISK → needs_work (collapses to UI 4-state)', () => {
    expect(adaptLaunchStatus('AT_RISK')).toBe('needs_work');
  });

  it('maps NOT_READY → stop', () => {
    expect(adaptLaunchStatus('NOT_READY')).toBe('stop');
  });
});

// ---------------------------------------------------------------------------
// adaptCategoryScores
// ---------------------------------------------------------------------------

describe('adaptCategoryScores', () => {
  it('returns zeros for every UI category when list is empty', () => {
    const out = adaptCategoryScores([]);
    expect(out.PRODUCT_INTENT).toBe(0);
    expect(out.REQUIREMENT_COVERAGE).toBe(0);
    expect(out.FEATURE_GRAPH).toBe(0);
    expect(out.FUNCTIONAL_FLOW).toBe(0);
    expect(out.UX_UI).toBe(0);
    expect(out.FRONTEND_CODE).toBe(0);
    expect(out.BACKEND_API).toBe(0);
    expect(out.DATA_MODEL).toBe(0);
    expect(out.SECURITY_PRIVACY).toBe(0);
    expect(out.LAUNCH_READINESS).toBe(0);
  });

  it('rounds scores to integers per category', () => {
    const list: AuditReport['categoryScores'] = [
      { category: 'SECURITY_PRIVACY', score: 72.6, label: 'Sec', summary: null },
      { category: 'UX_UI', score: 55.2, label: 'UX', summary: null },
    ];
    const out = adaptCategoryScores(list);
    expect(out.SECURITY_PRIVACY).toBe(73);
    expect(out.UX_UI).toBe(55);
  });

  it('drops MAINTAINABILITY_DOCUMENTATION (11th shared category) from UI record', () => {
    const list: AuditReport['categoryScores'] = [
      {
        category: 'MAINTAINABILITY_DOCUMENTATION',
        score: 90,
        label: 'Docs',
        summary: null,
      },
      { category: 'PRODUCT_INTENT', score: 80, label: 'Intent', summary: null },
    ];
    const out = adaptCategoryScores(list);
    expect(out.PRODUCT_INTENT).toBe(80);
    expect(Object.keys(out)).not.toContain('MAINTAINABILITY_DOCUMENTATION');
  });
});

// ---------------------------------------------------------------------------
// adaptFinding
// ---------------------------------------------------------------------------

describe('adaptFinding', () => {
  it('maps API confidence to UI lowercase enum', () => {
    const out = adaptFinding(makeFinding({ confidence: 'MEDIUM' }));
    expect(out.confidence).toBe('medium');
  });

  it('splits impact/recommendation bullet lines and strips bullet glyphs', () => {
    const out = adaptFinding(
      makeFinding({
        impact: '• one\n- two\n  3. three',
        recommendation: '* rec a\n  * rec b',
      })
    );
    expect(out.impact).toEqual(['one', 'two', 'three']);
    expect(out.recommendation).toEqual(['rec a', 'rec b']);
  });

  it('returns empty arrays when impact/recommendation are null', () => {
    const out = adaptFinding(
      makeFinding({ impact: null, recommendation: null })
    );
    expect(out.impact).toEqual([]);
    expect(out.recommendation).toEqual([]);
  });

  it('falls back to empty string when nonDeveloperExplanation/technicalExplanation are null', () => {
    const out = adaptFinding(
      makeFinding({
        nonDeveloperExplanation: null,
        technicalExplanation: null,
      })
    );
    expect(out.nonDeveloperExplanation).toBe('');
    expect(out.technicalExplanation).toBe('');
  });

  it('coerces non-UI category (MAINTAINABILITY_DOCUMENTATION) to LAUNCH_READINESS', () => {
    const out = adaptFinding(
      makeFinding({ category: 'MAINTAINABILITY_DOCUMENTATION' })
    );
    expect(out.category).toBe('LAUNCH_READINESS');
  });

  it('attaches adapted evidences when provided', () => {
    const out = adaptFinding(makeFinding(), [
      makeEvidence({ id: 'e-1' }),
      makeEvidence({ id: 'e-2', path: 'app/page.tsx' }),
    ]);
    expect(out.evidences).toHaveLength(2);
    expect(out.evidences[0]?.id).toBe('e-1');
    expect(out.evidences[1]?.filePath).toBe('app/page.tsx');
  });

  it('defaults evidences to empty array when none supplied', () => {
    const out = adaptFinding(makeFinding());
    expect(out.evidences).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// adaptEvidence
// ---------------------------------------------------------------------------

describe('adaptEvidence', () => {
  it('includes filePath / lineStart / lineEnd / snippet when present', () => {
    const out = adaptEvidence(
      makeEvidence({
        path: 'src/x.ts',
        lineStart: 1,
        lineEnd: 5,
        snippet: 'code',
      })
    );
    expect(out).toMatchObject({
      id: 'e-1',
      filePath: 'src/x.ts',
      lineStart: 1,
      lineEnd: 5,
      snippet: 'code',
    });
  });

  it('omits optional fields when source values are null', () => {
    const out = adaptEvidence(
      makeEvidence({
        path: null,
        lineStart: null,
        lineEnd: null,
        url: null,
        selector: null,
        snippet: null,
      })
    );
    expect(out.filePath).toBeUndefined();
    expect(out.lineStart).toBeUndefined();
    expect(out.lineEnd).toBeUndefined();
    expect(out.url).toBeUndefined();
    expect(out.selector).toBeUndefined();
    expect(out.snippet).toBeUndefined();
  });

  it('flags maskedSecret=true when maskedValue is non-null', () => {
    const out = adaptEvidence(makeEvidence({ maskedValue: 'sk-***' }));
    expect(out.maskedSecret).toBe(true);
  });

  it('flags maskedSecret=false when maskedValue is null', () => {
    const out = adaptEvidence(makeEvidence({ maskedValue: null }));
    expect(out.maskedSecret).toBe(false);
  });

  it('passes url and selector through when present', () => {
    const out = adaptEvidence(
      makeEvidence({
        url: 'https://example.com/page',
        selector: '#main > button',
      })
    );
    expect(out.url).toBe('https://example.com/page');
    expect(out.selector).toBe('#main > button');
  });
});

// ---------------------------------------------------------------------------
// adaptFeatureGraph
// ---------------------------------------------------------------------------

describe('adaptFeatureGraph', () => {
  function makeGraph(over: Partial<FeatureGraph> = {}): FeatureGraph {
    return {
      id: 'main',
      auditRunId: 'run-1',
      nodes: [],
      edges: [],
      summary: null,
      createdAt: ISO,
      updatedAt: ISO,
      ...over,
    };
  }

  it('returns empty nodes/edges when graph is empty', () => {
    const out = adaptFeatureGraph(makeGraph());
    expect(out.nodes).toEqual([]);
    expect(out.edges).toEqual([]);
  });

  it('assigns deterministic grid positions to nodes (4 cols, 260px wide, 140px tall)', () => {
    const out = adaptFeatureGraph(
      makeGraph({
        nodes: [
          {
            id: 'n0',
            type: 'page',
            label: 'A',
            status: 'complete',
            risk: null,
            confidence: 'HIGH',
            summary: null,
            evidenceIds: [],
            tags: [],
          },
          {
            id: 'n4',
            type: 'page',
            label: 'B',
            status: 'complete',
            risk: null,
            confidence: 'HIGH',
            summary: null,
            evidenceIds: [],
            tags: [],
          },
          {
            id: 'n5',
            type: 'page',
            label: 'C',
            status: 'complete',
            risk: null,
            confidence: 'HIGH',
            summary: null,
            evidenceIds: [],
            tags: [],
          },
        ],
      })
    );
    // index 0 → col 0 row 0 → (0*260+40, 0*140+40) = (40, 40)
    expect(out.nodes[0]?.position).toEqual({ x: 40, y: 40 });
    // index 1 → col 1 row 0 → (1*260+40, 0*140+40) = (300, 40)
    expect(out.nodes[1]?.position).toEqual({ x: 300, y: 40 });
    // index 2 → col 2 row 0 → (2*260+40, 0*140+40) = (560, 40)
    expect(out.nodes[2]?.position).toEqual({ x: 560, y: 40 });
  });

  it('includes summary on node only when source summary is non-null', () => {
    const out = adaptFeatureGraph(
      makeGraph({
        nodes: [
          {
            id: 'n-with',
            type: 'page',
            label: 'A',
            status: 'complete',
            risk: null,
            confidence: 'HIGH',
            summary: 'has summary',
            evidenceIds: [],
            tags: [],
          },
          {
            id: 'n-without',
            type: 'page',
            label: 'B',
            status: 'complete',
            risk: null,
            confidence: 'HIGH',
            summary: null,
            evidenceIds: [],
            tags: [],
          },
        ],
      })
    );
    expect(out.nodes[0]?.summary).toBe('has summary');
    expect(out.nodes[1]?.summary).toBeUndefined();
  });

  it('preserves edge id/source/target/type when adapting', () => {
    const out = adaptFeatureGraph(
      makeGraph({
        edges: [
          {
            id: 'edge-1',
            source: 'a',
            target: 'b',
            type: 'renders',
            status: 'complete',
            summary: null,
          },
          {
            id: 'edge-2',
            source: 'b',
            target: 'c',
            type: 'calls_api',
            status: 'partial',
            summary: 'API call',
          },
        ],
      })
    );
    expect(out.edges).toEqual([
      { id: 'edge-1', source: 'a', target: 'b', type: 'renders' },
      { id: 'edge-2', source: 'b', target: 'c', type: 'calls_api' },
    ]);
  });
});
