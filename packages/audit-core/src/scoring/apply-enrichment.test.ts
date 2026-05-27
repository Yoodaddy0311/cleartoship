import { describe, it, expect } from 'vitest';
import { applyEnrichment, enrichmentCacheKey } from './apply-enrichment.js';
import type {
  AuditEnrichment,
  CategoryEnrichment,
  CategoryScore,
} from '@cleartoship/shared-types';

function cat(
  category: CategoryScore['category'],
  score: number | null,
  origin: CategoryScore['origin'] = 'D',
): CategoryScore {
  return { category, score, label: category, summary: null, origin };
}

function enrich(
  categories: CategoryEnrichment[],
  status: AuditEnrichment['status'] = 'DONE',
): AuditEnrichment {
  return { status, commitSha: 'abc123', categories };
}

const PI = (scoreL: number, narrative = 'README 기준 의도 명확'): CategoryEnrichment => ({
  category: 'PRODUCT_INTENT',
  scoreL,
  narrative,
  confidence: 'MEDIUM',
  sources: ['README.md'],
});

describe('applyEnrichment', () => {
  it('passes scores through unchanged when enrichment is absent', () => {
    const scores = [cat('SECURITY_PRIVACY', 80), cat('PRODUCT_INTENT', null, 'none')];
    const out = applyEnrichment(scores, undefined);
    expect(out).toEqual(scores);
  });

  it('passes through when status is not DONE', () => {
    const scores = [cat('PRODUCT_INTENT', null, 'none')];
    expect(applyEnrichment(scores, enrich([PI(70)], 'PENDING'))[0]).toEqual(scores[0]);
    expect(applyEnrichment(scores, enrich([PI(70)], 'ERROR'))[0]).toEqual(scores[0]);
  });

  it('lifts an N/A (L-only) category to the skill score with origin L', () => {
    const out = applyEnrichment([cat('PRODUCT_INTENT', null, 'none')], enrich([PI(70)]));
    const pi = out.find((c) => c.category === 'PRODUCT_INTENT')!;
    expect(pi.score).toBe(70);
    expect(pi.origin).toBe('L');
    expect(pi.summary).toBe('README 기준 의도 명확');
  });

  it('blends a D score with the L score → mixed origin', () => {
    // D 50 + L 70 → 50*0.6 + 70*0.4 = 58; |50-70|=20 > 15 → conflict.
    const out = applyEnrichment([cat('PRODUCT_INTENT', 50, 'D')], enrich([PI(70)]));
    const pi = out.find((c) => c.category === 'PRODUCT_INTENT')!;
    expect(pi.score).toBe(58);
    expect(pi.origin).toBe('mixed');
  });

  it('prefixes ⚠️ on a D+L conflict', () => {
    const out = applyEnrichment([cat('PRODUCT_INTENT', 50, 'D')], enrich([PI(90)]));
    expect(out[0]!.summary?.startsWith('⚠️')).toBe(true);
  });

  it('does not prefix ⚠️ when D and L agree', () => {
    const out = applyEnrichment([cat('PRODUCT_INTENT', 65, 'D')], enrich([PI(70)]));
    expect(out[0]!.summary).toBe('README 기준 의도 명확'); // no ⚠️
    expect(out[0]!.origin).toBe('mixed');
  });

  it('leaves non-enriched categories untouched', () => {
    const out = applyEnrichment(
      [cat('SECURITY_PRIVACY', 80), cat('PRODUCT_INTENT', null, 'none')],
      enrich([PI(70)]),
    );
    expect(out.find((c) => c.category === 'SECURITY_PRIVACY')).toEqual(cat('SECURITY_PRIVACY', 80));
  });

  it('does not mutate the input array or its entries', () => {
    const scores = [cat('PRODUCT_INTENT', null, 'none')];
    const snapshot = JSON.parse(JSON.stringify(scores));
    applyEnrichment(scores, enrich([PI(70)]));
    expect(scores).toEqual(snapshot);
  });
});

describe('enrichmentCacheKey', () => {
  it('combines commit + category', () => {
    expect(enrichmentCacheKey('abc', 'PRODUCT_INTENT')).toBe('abc:PRODUCT_INTENT');
  });
  it('uses a stable placeholder for a null commit', () => {
    expect(enrichmentCacheKey(null, 'PRODUCT_INTENT')).toBe('nocommit:PRODUCT_INTENT');
  });
});
