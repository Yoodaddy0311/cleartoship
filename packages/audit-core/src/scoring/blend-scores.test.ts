import { describe, it, expect } from 'vitest';
import {
  blendScores,
  L_BLEND_AGREEMENT_DELTA,
} from './blend-scores.js';

describe('blendScores', () => {
  it('neither score → N/A (none, null, LOW)', () => {
    expect(blendScores({ scoreD: null, scoreL: null })).toEqual({
      score: null,
      origin: 'none',
      confidence: 'LOW',
      conflict: false,
    });
  });

  it('D only → origin D, HIGH confidence, the deterministic number', () => {
    expect(blendScores({ scoreD: 84, scoreL: null })).toEqual({
      score: 84,
      origin: 'D',
      confidence: 'HIGH',
      conflict: false,
    });
  });

  it('L only → origin L, LOW confidence (single soft signal)', () => {
    expect(blendScores({ scoreD: null, scoreL: 70 })).toEqual({
      score: 70,
      origin: 'L',
      confidence: 'LOW',
      conflict: false,
    });
  });

  it('both, in agreement → mixed, D-weighted blend, HIGH', () => {
    // 80*0.6 + 70*0.4 = 48 + 28 = 76; |80-70| = 10 ≤ 15 → agreement.
    expect(blendScores({ scoreD: 80, scoreL: 70 })).toEqual({
      score: 76,
      origin: 'mixed',
      confidence: 'HIGH',
      conflict: false,
    });
  });

  it('both, in conflict → mixed, LOW + conflict flag', () => {
    // |80-50| = 30 > 15 → conflict; 80*0.6 + 50*0.4 = 48 + 20 = 68.
    const r = blendScores({ scoreD: 80, scoreL: 50 });
    expect(r.origin).toBe('mixed');
    expect(r.score).toBe(68);
    expect(r.conflict).toBe(true);
    expect(r.confidence).toBe('LOW');
  });

  it('agreement boundary is inclusive at the delta', () => {
    // |70 - (70+15)| == 15 → still agreement (HIGH, no conflict).
    expect(blendScores({ scoreD: 70, scoreL: 70 + L_BLEND_AGREEMENT_DELTA }).conflict).toBe(false);
    // one more point apart → conflict.
    expect(blendScores({ scoreD: 70, scoreL: 70 + L_BLEND_AGREEMENT_DELTA + 1 }).conflict).toBe(true);
  });

  it('rounds the blended score', () => {
    // 81*0.6 + 70*0.4 = 48.6 + 28 = 76.6 → 77.
    expect(blendScores({ scoreD: 81, scoreL: 70 }).score).toBe(77);
  });

  it('clamps inputs into 0..100', () => {
    expect(blendScores({ scoreD: 100, scoreL: 100 }).score).toBe(100);
    expect(blendScores({ scoreD: 0, scoreL: 0 }).score).toBe(0);
  });
});
