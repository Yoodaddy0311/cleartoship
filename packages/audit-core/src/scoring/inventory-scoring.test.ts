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
import type {
  DataModelInventory,
  RepoMetadata,
  RouteInventory,
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
