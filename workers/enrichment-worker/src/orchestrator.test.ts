import { describe, it, expect, vi } from 'vitest';
import type { AuditReport, AuditRun } from '@cleartoship/shared-types';
import { buildContext, runEnrichment } from './orchestrator.js';
import type { EnrichmentLlmRequest, EnrichmentLlmResponse, LlmProvider } from './types.js';

function makeRun(overrides: Partial<AuditRun> = {}): AuditRun {
  return {
    repoUrl: 'https://github.com/acme/widget',
    deployUrl: null,
    prdText: null,
    commitHash: 'abc123',
    ...overrides,
  } as unknown as AuditRun;
}

function makeReport(overrides: Partial<AuditReport> = {}): AuditReport {
  return {
    readinessScore: 72,
    launchStatus: 'CONDITIONAL',
    executiveSummary: '대체로 양호하나 보안 보강 필요',
    markdown: '# Report\nThis project is a widget store.',
    categoryScores: [
      { category: 'SECURITY_PRIVACY', score: 68, label: 'Security', summary: null, origin: 'D' },
      { category: 'PRODUCT_INTENT', score: null, label: 'Product Intent', summary: null, origin: 'none' },
    ],
    ...overrides,
  } as unknown as AuditReport;
}

/** Deterministic fake — returns a canned response keyed by category. */
function fakeProvider(
  responses: Partial<Record<string, EnrichmentLlmResponse | (() => never)>>,
): LlmProvider {
  return {
    async judge(req: EnrichmentLlmRequest): Promise<EnrichmentLlmResponse> {
      const r = responses[req.category];
      if (typeof r === 'function') r(); // throws
      if (!r) throw new Error(`no fake for ${req.category}`);
      return r;
    },
  };
}

const loadSkill = (name: string) => `SKILL BODY for ${name}`;

describe('buildContext', () => {
  it('includes repo, score, and deterministic category lines', () => {
    const ctx = buildContext('PRODUCT_INTENT', makeRun(), makeReport());
    expect(ctx).toContain('https://github.com/acme/widget');
    expect(ctx).toContain('Readiness score: 72');
    expect(ctx).toContain('SECURITY_PRIVACY: 68 (origin D)');
    expect(ctx).toContain('PRODUCT_INTENT: N/A');
  });

  it('embeds the PRD for REQUIREMENT_COVERAGE', () => {
    const ctx = buildContext('REQUIREMENT_COVERAGE', makeRun({ prdText: 'REQ-1 user can log in' }), makeReport());
    expect(ctx).toContain('REQ-1 user can log in');
  });

  it('truncates an over-long PRD', () => {
    const big = 'x'.repeat(20000);
    const ctx = buildContext('REQUIREMENT_COVERAGE', makeRun({ prdText: big }), makeReport());
    expect(ctx).toContain('truncated');
    expect(ctx.length).toBeLessThan(big.length);
  });
});

describe('runEnrichment', () => {
  const okPI: EnrichmentLlmResponse = {
    scoreL: 75,
    narrative: '의도 명확',
    confidence: 'MEDIUM',
    sources: ['README.md'],
    tokensUsed: 1200,
  };

  it('produces a DONE enrichment with the judged categories', async () => {
    const out = await runEnrichment({
      run: makeRun(),
      report: makeReport(),
      provider: fakeProvider({ PRODUCT_INTENT: okPI }),
      loadSkill,
    });
    expect(out.status).toBe('DONE');
    expect(out.commitSha).toBe('abc123');
    expect(out.categories).toHaveLength(1);
    expect(out.categories[0]).toMatchObject({ category: 'PRODUCT_INTENT', scoreL: 75 });
    expect(out.totalTokens).toBe(1200);
  });

  it('skips REQUIREMENT_COVERAGE when no PRD was supplied', async () => {
    const judge = vi.fn(async () => okPI);
    await runEnrichment({
      run: makeRun({ prdText: null }),
      report: makeReport(),
      provider: { judge },
      loadSkill,
    });
    // Only PRODUCT_INTENT should have been judged (1 call), not REQUIREMENT_COVERAGE.
    expect(judge).toHaveBeenCalledTimes(1);
    expect(judge.mock.calls[0]![0].category).toBe('PRODUCT_INTENT');
  });

  it('drops a category whose skill returned a null score (not measurable)', async () => {
    const out = await runEnrichment({
      run: makeRun(),
      report: makeReport(),
      provider: fakeProvider({ PRODUCT_INTENT: { ...okPI, scoreL: null } }),
      loadSkill,
    });
    expect(out.categories).toHaveLength(0);
    expect(out.status).toBe('SKIPPED');
  });

  it('continues past a per-category error and records it', async () => {
    const onError = vi.fn();
    const out = await runEnrichment({
      run: makeRun({ prdText: 'REQ-1' }),
      report: makeReport(),
      provider: fakeProvider({
        PRODUCT_INTENT: () => {
          throw new Error('boom');
        },
        REQUIREMENT_COVERAGE: { ...okPI, scoreL: 60, sources: ['<prd>'] },
      }),
      loadSkill,
      onError,
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(out.categories.map((c) => c.category)).toEqual(['REQUIREMENT_COVERAGE']);
    expect(out.status).toBe('DONE');
  });

  it('sums tokens across categories', async () => {
    const out = await runEnrichment({
      run: makeRun({ prdText: 'REQ-1' }),
      report: makeReport(),
      provider: fakeProvider({
        PRODUCT_INTENT: { ...okPI, tokensUsed: 1000 },
        REQUIREMENT_COVERAGE: { ...okPI, scoreL: 60, tokensUsed: 800 },
      }),
      loadSkill,
    });
    expect(out.totalTokens).toBe(1800);
  });
});
