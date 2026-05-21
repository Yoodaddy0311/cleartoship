// PR-A4 — verify that source-driven inventories lift the right categories
// out of N/A and that origin attribution is assigned correctly.
//
// These tests are deliberately separate from `calculate-scores.test.ts` so
// the existing test suite (which calls `calculateScores` without the new
// `inventories` field) still asserts pre-PR-A4 behaviour unchanged.

import { describe, it, expect } from 'vitest';
import { calculateScores } from './calculate-scores.js';
import type {
  DataModelInventory,
  RepoMetadata,
  RouteInventory,
} from '@cleartoship/shared-types';

const NO_COVERAGE = {
  // featureNodeCount === 0 triggers the coverage-NA branch for
  // PRODUCT_INTENT / REQUIREMENT_COVERAGE under legacy behaviour.
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

describe('calculateScores — PR-A4 inventory un-N/A', () => {
  it('keeps legacy N/A behaviour when inventories are omitted', () => {
    const r = calculateScores({
      findings: [],
      coverage: NO_COVERAGE,
      availableTools: NO_TOOLS,
    });
    const productIntent = r.categoryScores.find((c) => c.category === 'PRODUCT_INTENT');
    expect(productIntent?.score).toBeNull();
    expect(productIntent?.origin).toBe('none');
  });

  it('lifts PRODUCT_INTENT out of N/A when repoMetadata has a description', () => {
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
    expect(pi.score).toBe(100);
    expect(pi.origin).toBe('F');
  });

  it('lifts PRODUCT_INTENT out of N/A when topics is non-empty even without description', () => {
    const r = calculateScores({
      findings: [],
      coverage: NO_COVERAGE,
      availableTools: NO_TOOLS,
      inventories: {
        repoMetadata: {
          ...emptyRepoMetadata(),
          topics: ['audit', 'vibe-coding'],
        },
      },
    });
    const pi = r.categoryScores.find((c) => c.category === 'PRODUCT_INTENT')!;
    expect(pi.score).toBe(100);
    expect(pi.origin).toBe('F');
  });

  it('does NOT lift PRODUCT_INTENT when both description and topics are empty', () => {
    const r = calculateScores({
      findings: [],
      coverage: NO_COVERAGE,
      availableTools: NO_TOOLS,
      inventories: { repoMetadata: emptyRepoMetadata() },
    });
    const pi = r.categoryScores.find((c) => c.category === 'PRODUCT_INTENT')!;
    expect(pi.score).toBeNull();
    expect(pi.origin).toBe('none');
  });

  it('lifts FEATURE_GRAPH out of N/A when routeInventory has routes', () => {
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
    expect(fg.score).toBe(100);
    expect(fg.origin).toBe('D');
  });

  it('lifts DATA_MODEL out of N/A when dataModelInventory has entities', () => {
    const r = calculateScores({
      findings: [],
      coverage: NO_COVERAGE,
      availableTools: NO_TOOLS,
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
    const dm = r.categoryScores.find((c) => c.category === 'DATA_MODEL')!;
    expect(dm.score).toBe(100);
    expect(dm.origin).toBe('D');
  });

  it('does NOT lift DATA_MODEL when inventory tech is "none"', () => {
    const r = calculateScores({
      findings: [],
      coverage: NO_COVERAGE,
      availableTools: NO_TOOLS,
      inventories: { dataModelInventory: emptyDataModelInventory() },
    });
    const dm = r.categoryScores.find((c) => c.category === 'DATA_MODEL')!;
    expect(dm.origin === 'none' || dm.score === null).toBe(true);
  });

  it('reports origin "mixed" when findings AND inventory both contribute', () => {
    const r = calculateScores({
      findings: [{ category: 'FEATURE_GRAPH', severity: 'P2' }],
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
    // P2 deduction = -4 from 100 baseline
    expect(fg.score).toBe(96);
    expect(fg.origin).toBe('mixed');
  });
});
