import { describe, it, expect } from 'vitest';
import {
  PATTERN_BASELINE,
  scoreFromPatterns,
  type PatternEvidence,
} from './score-from-patterns.js';

function p(
  patternId: string,
  matched: boolean,
  scoreImpact: number,
  evidence = 'evidence',
): PatternEvidence {
  return { patternId, matched, scoreImpact, evidence };
}

describe('scoreFromPatterns', () => {
  it('returns the baseline at LOW confidence for an empty pattern set', () => {
    const r = scoreFromPatterns([]);
    expect(r.score).toBe(PATTERN_BASELINE);
    expect(r.confidence).toBe('LOW');
    expect(r.origin).toBe('D');
    expect(r.matched).toEqual([]);
  });

  it('adds the impacts of matched patterns (ignores unmatched)', () => {
    const r = scoreFromPatterns([p('a', true, 10), p('b', true, 5), p('c', false, 20)], 50);
    expect(r.score).toBe(65);
  });

  it('subtracts negative impacts', () => {
    expect(scoreFromPatterns([p('a', true, -20)], 50).score).toBe(30);
  });

  it('clamps the result to 0..100', () => {
    expect(scoreFromPatterns([p('a', true, 80)], 50).score).toBe(100);
    expect(scoreFromPatterns([p('a', true, -80)], 50).score).toBe(0);
  });

  it('is MEDIUM confidence below 5 patterns and HIGH at 5+', () => {
    expect(scoreFromPatterns([p('a', true, 1)]).confidence).toBe('MEDIUM');
    expect(
      scoreFromPatterns([
        p('a', true, 1),
        p('b', false, 1),
        p('c', true, 1),
        p('d', false, 1),
        p('e', true, 1),
      ]).confidence,
    ).toBe('HIGH');
  });

  it('returns only the matched patterns in `matched`', () => {
    const r = scoreFromPatterns([p('a', true, 1), p('b', false, 1)]);
    expect(r.matched.map((m) => m.patternId)).toEqual(['a']);
  });

  it('respects a custom baseline', () => {
    expect(scoreFromPatterns([], 40).score).toBe(40);
  });
});
