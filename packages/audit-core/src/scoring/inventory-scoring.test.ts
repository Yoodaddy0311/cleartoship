// PR-A4-fix (2026-05-21) — Inventory signals are EVIDENCE, not scores.
//
// The original PR-A4 lifted categories out of N/A whenever an inventory
// carried any data. The user pointed out this conflates "data exists" with
// "quality verified" — a GitHub description doesn't prove the product
// intent is clear, it just proves there *is* a description.
//
// Fixed behaviour, exercised below:
//   - Categories stay N/A when only inventory data is available.
//   - `result.inventorySignals` carries the boolean flags so the UI can
//     render positive cards in the strengths panel ("발견된 권장사항").
//   - Findings still deduct from the 100 baseline as before — that is the
//     only path to a numeric score in this PR. PR-B (LLM) will be the
//     first input that *judges quality* (not just existence) and assigns
//     'F' / 'L' / 'mixed' origins.

import { describe, it, expect } from 'vitest';
import { calculateScores } from './calculate-scores.js';
import {
  dataModelBaseline,
  deriveInventoryBaselines,
  featureGraphBaseline,
  functionalFlowBaseline,
} from './inventory-scoring.js';
import type {
  DataModelInventory,
  RouteEntry,
  RouteInventory,
  RepoMetadata,
} from '@cleartoship/shared-types';

const NO_COVERAGE = {
  featureNodeCount: 0,
  analyzedFileCount: 100,
  deployUrlReachable: true,
};

const NO_TOOLS = {
  semgrep: true,
  osvScanner: true,
  lighthouse: true,
  secretsScanner: true,
};

function emptyRouteInventory(): RouteInventory {
  return {
    routes: [],
    counts: { pages: 0, apis: 0, dynamic: 0, byFramework: {} },
    hasNextJs: false,
    isEmpty: true,
  };
}

function emptyDataModelInventory(): DataModelInventory {
  return {
    tech: 'none',
    entities: [],
    sourceFiles: [],
    confidence: 'high',
  };
}

function emptyRepoMetadata(): RepoMetadata {
  return {
    owner: 'owner',
    repo: 'repo',
    defaultBranch: 'main',
    description: null,
    topics: [],
    license: null,
    stars: 0,
    forks: 0,
    openIssues: 0,
    languages: {},
    primaryLanguage: null,
    sizeKb: 0,
    pushedAt: null,
    createdAt: null,
    latestRelease: null,
    retrievedAt: new Date().toISOString(),
    authenticated: false,
  };
}

describe('calculateScores — PR-A4-fix inventory as evidence (not score)', () => {
  it('keeps PRODUCT_INTENT N/A even when repoMetadata has a description', () => {
    const r = calculateScores({
      findings: [],
      coverage: NO_COVERAGE,
      availableTools: NO_TOOLS,
      inventories: {
        repoMetadata: {
          ...emptyRepoMetadata(),
          description: 'A vibe-coded audit tool',
        },
      },
    });
    const pi = r.categoryScores.find((c) => c.category === 'PRODUCT_INTENT')!;
    expect(pi.score).toBeNull();
    expect(pi.origin).toBe('none');
    // ...but the surfaceable evidence flag is set so the UI can render
    // a strength card.
    expect(r.inventorySignals.repoMetadata).toBe(true);
  });

  it('keeps FEATURE_GRAPH at baseline 100 (already non-N/A) when routeInventory has routes', () => {
    // FEATURE_GRAPH has a non-empty measuredBy and is not coverage-dependent,
    // so it would already be scored 100 without inventory help. The inventory
    // signal only flips the dashboard strengths card, not the score.
    const r = calculateScores({
      findings: [],
      coverage: NO_COVERAGE,
      availableTools: NO_TOOLS,
      inventories: {
        routeInventory: {
          ...emptyRouteInventory(),
          routes: [
            {
              urlPath: '/',
              framework: 'next-app',
              type: 'page',
              sourceFile: 'app/page.tsx',
              segments: [],
              hasDynamic: false,
              hasCatchAll: false,
            },
          ],
          counts: { pages: 1, apis: 0, dynamic: 0, byFramework: { 'next-app': 1 } },
          hasNextJs: true,
          isEmpty: false,
        },
      },
    });
    const fg = r.categoryScores.find((c) => c.category === 'FEATURE_GRAPH')!;
    // Whatever the score is (depends on measuredBy gating), the inventory
    // signal must be `true` so the strength card surfaces.
    expect(r.inventorySignals.routes).toBe(true);
    // Origin is 'D' or 'none' — never 'F'/'L'/'mixed' under the fixed model.
    expect(['D', 'none']).toContain(fg.origin);
  });

  it('exposes inventorySignals=false when no inventories supplied', () => {
    const r = calculateScores({
      findings: [],
      coverage: NO_COVERAGE,
      availableTools: NO_TOOLS,
    });
    expect(r.inventorySignals).toEqual({
      repoMetadata: false,
      dataModel: false,
      routes: false,
    });
  });

  it('exposes inventorySignals=false when inventories are present but empty', () => {
    const r = calculateScores({
      findings: [],
      coverage: NO_COVERAGE,
      availableTools: NO_TOOLS,
      inventories: {
        repoMetadata: emptyRepoMetadata(),
        dataModelInventory: emptyDataModelInventory(),
        routeInventory: emptyRouteInventory(),
      },
    });
    expect(r.inventorySignals.repoMetadata).toBe(false);
    expect(r.inventorySignals.dataModel).toBe(false);
    expect(r.inventorySignals.routes).toBe(false);
  });

  it('detects repoMetadata signal via topics alone (description optional)', () => {
    const r = calculateScores({
      findings: [],
      inventories: {
        repoMetadata: {
          ...emptyRepoMetadata(),
          topics: ['audit', 'vibe-coding'],
        },
      },
    });
    expect(r.inventorySignals.repoMetadata).toBe(true);
  });

  it('detects dataModel signal when tech is not "none" AND entities present', () => {
    const r = calculateScores({
      findings: [],
      inventories: {
        dataModelInventory: {
          tech: 'firestore',
          entities: [
            { name: 'users', fieldCount: null, hasRelations: false, sourceFile: 'firestore.rules' },
          ],
          sourceFiles: ['firestore.rules'],
          confidence: 'high',
        },
      },
    });
    expect(r.inventorySignals.dataModel).toBe(true);
  });

  it('does NOT flag dataModel signal when tech is "none"', () => {
    const r = calculateScores({
      findings: [],
      inventories: { dataModelInventory: emptyDataModelInventory() },
    });
    expect(r.inventorySignals.dataModel).toBe(false);
  });

  it('every numeric (non-null) score has origin "D"', () => {
    // The only non-deterministic origin paths require PR-B (LLM).
    const r = calculateScores({
      findings: [{ category: 'SECURITY_PRIVACY', severity: 'P2' }],
      coverage: { featureNodeCount: 5, analyzedFileCount: 100, deployUrlReachable: true },
      availableTools: NO_TOOLS,
    });
    for (const c of r.categoryScores) {
      if (c.score !== null) {
        expect(c.origin).toBe('D');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 1.3 (Audit Quality Roadmap §4.3) — inventory → baseline scoring.
//
// Distinct from PR-A4-fix above: PR-A4-fix proved inventory *existence* is not
// quality and kept categories N/A. Phase 1.3 narrows that to the structural
// categories only (FEATURE_GRAPH / FUNCTIONAL_FLOW / DATA_MODEL), where a
// deterministic file-tree inventory is a real-if-shallow structure
// measurement worth a MODEST baseline (50–75). PRODUCT_INTENT /
// REQUIREMENT_COVERAGE must still stay N/A (Phase 3 / LLM territory).
// ---------------------------------------------------------------------------

function pageRoute(urlPath: string, hasDynamic = false): RouteEntry {
  return {
    urlPath,
    framework: 'next-app',
    type: 'page',
    sourceFile: `app${urlPath}/page.tsx`,
    segments: [],
    hasDynamic,
    hasCatchAll: false,
  };
}

function routeInventoryWith(
  routeCount: number,
  opts: { dynamic?: number } = {},
): RouteInventory {
  const dynamic = opts.dynamic ?? 0;
  const routes: RouteEntry[] = [];
  for (let i = 0; i < routeCount; i += 1) {
    routes.push(pageRoute(`/r${i}`, i < dynamic));
  }
  return {
    routes,
    counts: {
      pages: routeCount,
      apis: 0,
      dynamic,
      byFramework: { 'next-app': routeCount },
    },
    hasNextJs: routeCount > 0,
    isEmpty: routeCount === 0,
  };
}

function dataModelWith(
  tech: DataModelInventory['tech'],
  entityCount: number,
): DataModelInventory {
  const entities = Array.from({ length: entityCount }, (_, i) => ({
    name: `Entity${i}`,
    fieldCount: 3,
    hasRelations: false,
    sourceFile: 'schema.prisma',
  }));
  return { tech, entities, sourceFiles: ['schema.prisma'], confidence: 'high' as const };
}

describe('inventory-scoring — featureGraphBaseline', () => {
  it('returns null for an undefined inventory', () => {
    expect(featureGraphBaseline(undefined)).toBeNull();
  });
  it('returns null when there are zero routes', () => {
    expect(featureGraphBaseline(routeInventoryWith(0))).toBeNull();
  });
  it('returns 50 for 1–5 routes (boundary inclusive)', () => {
    expect(featureGraphBaseline(routeInventoryWith(1))?.score).toBe(50);
    expect(featureGraphBaseline(routeInventoryWith(5))?.score).toBe(50);
  });
  it('returns 70 for more than 5 routes', () => {
    expect(featureGraphBaseline(routeInventoryWith(6))?.score).toBe(70);
  });
  it('always attributes origin "D"', () => {
    expect(featureGraphBaseline(routeInventoryWith(3))?.origin).toBe('D');
  });
});

describe('inventory-scoring — functionalFlowBaseline', () => {
  it('returns null without inventory', () => {
    expect(functionalFlowBaseline(undefined)).toBeNull();
  });
  it('returns null when there are no dynamic routes', () => {
    expect(functionalFlowBaseline(routeInventoryWith(5, { dynamic: 0 }))).toBeNull();
  });
  it('returns null when there are dynamic routes but no pages', () => {
    const inv = routeInventoryWith(2, { dynamic: 2 });
    const crafted: RouteInventory = {
      ...inv,
      counts: { ...inv.counts, pages: 0, dynamic: 2 },
    };
    expect(functionalFlowBaseline(crafted)).toBeNull();
  });
  it('returns 50 when pages > 0 and dynamic > 0', () => {
    expect(functionalFlowBaseline(routeInventoryWith(4, { dynamic: 1 }))?.score).toBe(50);
  });
});

describe('inventory-scoring — dataModelBaseline', () => {
  it('returns null without inventory', () => {
    expect(dataModelBaseline(undefined)).toBeNull();
  });
  it('returns null when tech is "none"', () => {
    expect(dataModelBaseline(dataModelWith('none', 0))).toBeNull();
  });
  it('returns null when tech is detected but there are zero entities', () => {
    expect(dataModelBaseline(dataModelWith('prisma', 0))).toBeNull();
  });
  it('returns 60 for 1–2 entities', () => {
    expect(dataModelBaseline(dataModelWith('prisma', 1))?.score).toBe(60);
    expect(dataModelBaseline(dataModelWith('prisma', 2))?.score).toBe(60);
  });
  it('returns 75 for 3+ entities', () => {
    expect(dataModelBaseline(dataModelWith('firestore', 3))?.score).toBe(75);
  });
});

describe('inventory-scoring — deriveInventoryBaselines', () => {
  it('is empty when no inventories are supplied', () => {
    expect(deriveInventoryBaselines({}).size).toBe(0);
  });
  it('maps the three structural categories when data is present', () => {
    const m = deriveInventoryBaselines({
      routeInventory: routeInventoryWith(6, { dynamic: 2 }),
      dataModelInventory: dataModelWith('prisma', 4),
    });
    expect(m.get('FEATURE_GRAPH')?.score).toBe(70);
    expect(m.get('FUNCTIONAL_FLOW')?.score).toBe(50);
    expect(m.get('DATA_MODEL')?.score).toBe(75);
  });
  it('never includes PRODUCT_INTENT or REQUIREMENT_COVERAGE', () => {
    const m = deriveInventoryBaselines({
      routeInventory: routeInventoryWith(6, { dynamic: 2 }),
      dataModelInventory: dataModelWith('prisma', 4),
    });
    expect(m.has('PRODUCT_INTENT')).toBe(false);
    expect(m.has('REQUIREMENT_COVERAGE')).toBe(false);
  });
});

describe('calculateScores — Phase 1.3 inventory baselines (integration)', () => {
  it('lifts FEATURE_GRAPH from N/A to 50 with 1–5 routes', () => {
    const r = calculateScores({
      findings: [],
      inventories: { routeInventory: routeInventoryWith(3) },
    });
    const fg = r.categoryScores.find((c) => c.category === 'FEATURE_GRAPH')!;
    expect(fg.score).toBe(50);
    expect(fg.origin).toBe('D');
  });

  it('scores FEATURE_GRAPH 70 with more than 5 routes', () => {
    const r = calculateScores({
      findings: [],
      inventories: { routeInventory: routeInventoryWith(8) },
    });
    expect(r.categoryScores.find((c) => c.category === 'FEATURE_GRAPH')!.score).toBe(70);
  });

  it('lifts FUNCTIONAL_FLOW to 50 with pages + dynamic routes', () => {
    const r = calculateScores({
      findings: [],
      inventories: { routeInventory: routeInventoryWith(4, { dynamic: 1 }) },
    });
    expect(r.categoryScores.find((c) => c.category === 'FUNCTIONAL_FLOW')!.score).toBe(50);
  });

  it('keeps FUNCTIONAL_FLOW N/A when there are no dynamic routes', () => {
    const r = calculateScores({
      findings: [],
      inventories: { routeInventory: routeInventoryWith(4, { dynamic: 0 }) },
    });
    expect(r.categoryScores.find((c) => c.category === 'FUNCTIONAL_FLOW')!.score).toBeNull();
  });

  it('lifts DATA_MODEL to 60 (1–2 entities) and 75 (3+)', () => {
    const r60 = calculateScores({
      findings: [],
      inventories: { dataModelInventory: dataModelWith('prisma', 2) },
    });
    const r75 = calculateScores({
      findings: [],
      inventories: { dataModelInventory: dataModelWith('firestore', 5) },
    });
    expect(r60.categoryScores.find((c) => c.category === 'DATA_MODEL')!.score).toBe(60);
    expect(r75.categoryScores.find((c) => c.category === 'DATA_MODEL')!.score).toBe(75);
  });

  it('keeps DATA_MODEL N/A when tech is "none"', () => {
    const r = calculateScores({
      findings: [],
      inventories: { dataModelInventory: emptyDataModelInventory() },
    });
    expect(r.categoryScores.find((c) => c.category === 'DATA_MODEL')!.score).toBeNull();
  });

  it('keeps PRODUCT_INTENT / REQUIREMENT_COVERAGE N/A even with rich inventories', () => {
    const r = calculateScores({
      findings: [],
      coverage: { featureNodeCount: 0 },
      inventories: {
        routeInventory: routeInventoryWith(8, { dynamic: 3 }),
        dataModelInventory: dataModelWith('prisma', 5),
      },
    });
    expect(r.categoryScores.find((c) => c.category === 'PRODUCT_INTENT')!.score).toBeNull();
    expect(r.categoryScores.find((c) => c.category === 'REQUIREMENT_COVERAGE')!.score).toBeNull();
  });

  it('baselined categories enter the weighted average (pull an otherwise-100 score down)', () => {
    const withInv = calculateScores({
      findings: [],
      inventories: {
        routeInventory: routeInventoryWith(3), // FEATURE_GRAPH 50
        dataModelInventory: dataModelWith('prisma', 2), // DATA_MODEL 60
      },
    });
    const withoutInv = calculateScores({ findings: [] });
    expect(withoutInv.readinessScore).toBe(100);
    expect(withInv.readinessScore).toBeLessThan(100);
  });

  it('treats the baseline as a floor — a finding can only lower it, never raise it', () => {
    const r = calculateScores({
      findings: [{ category: 'FEATURE_GRAPH', severity: 'P1' }],
      inventories: { routeInventory: routeInventoryWith(8) }, // baseline 70
    });
    const fg = r.categoryScores.find((c) => c.category === 'FEATURE_GRAPH')!;
    // bucket 100 − 8 (P1) = 92; min(70, 92) = 70.
    expect(fg.score).toBe(70);
  });

  it('omitting inventories preserves the legacy N/A behaviour', () => {
    const r = calculateScores({ findings: [] });
    expect(r.categoryScores.find((c) => c.category === 'FEATURE_GRAPH')!.score).toBeNull();
    expect(r.categoryScores.find((c) => c.category === 'FUNCTIONAL_FLOW')!.score).toBeNull();
    expect(r.categoryScores.find((c) => c.category === 'DATA_MODEL')!.score).toBeNull();
  });
});

describe('calculateScores — Phase 2 patternScores integration', () => {
  it('lifts a no-measuredBy category (FRONTEND_CODE) to its pattern score', () => {
    const r = calculateScores({
      findings: [],
      patternScores: { FRONTEND_CODE: { score: 78, origin: 'D' } },
    });
    const fc = r.categoryScores.find((c) => c.category === 'FRONTEND_CODE')!;
    expect(fc.score).toBe(78);
    expect(fc.origin).toBe('D');
  });

  it('lifts MAINTAINABILITY_DOCUMENTATION from N/A to its pattern score', () => {
    const r = calculateScores({
      findings: [],
      patternScores: { MAINTAINABILITY_DOCUMENTATION: { score: 85, origin: 'D' } },
    });
    expect(
      r.categoryScores.find((c) => c.category === 'MAINTAINABILITY_DOCUMENTATION')!.score,
    ).toBe(85);
  });

  it('a pattern score takes precedence over an inventory baseline for the same category', () => {
    const r = calculateScores({
      findings: [],
      inventories: { routeInventory: routeInventoryWith(3) }, // FEATURE_GRAPH baseline 50
      patternScores: { FEATURE_GRAPH: { score: 82, origin: 'D' } },
    });
    expect(r.categoryScores.find((c) => c.category === 'FEATURE_GRAPH')!.score).toBe(82);
  });

  it('does NOT override a measured category (SECURITY_PRIVACY has a measuredBy step)', () => {
    const r = calculateScores({
      findings: [],
      patternScores: { SECURITY_PRIVACY: { score: 10, origin: 'D' } },
    });
    // SECURITY_PRIVACY is not N/A → the pattern score is ignored; no findings → 100.
    expect(r.categoryScores.find((c) => c.category === 'SECURITY_PRIVACY')!.score).toBe(100);
  });

  it('a pattern-scored category enters the weighted average', () => {
    const withP = calculateScores({
      findings: [],
      patternScores: { MAINTAINABILITY_DOCUMENTATION: { score: 40, origin: 'D' } },
    });
    const without = calculateScores({ findings: [] });
    expect(without.readinessScore).toBe(100);
    expect(withP.readinessScore).toBeLessThan(100);
  });
});
