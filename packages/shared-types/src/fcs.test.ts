import { describe, expect, it } from 'vitest';
import { ConcernSchema, FCSResultSchema } from './fcs.js';

const validConcern = {
  findingId: 'f-1',
  severity: 'P0' as const,
  confidence: 'HIGH' as const,
  impact: 12.5,
  ruleFamily: 'SECURITY_PRIVACY/secret-leak',
};

const validResult = {
  score: 72,
  lower: 64,
  upper: 80,
  uncertainty: 8,
  status: 'CONDITIONAL' as const,
  topConcerns: [validConcern],
  rationale: 'P0 1건 + P1 3건 → conditional ship.',
};

describe('ConcernSchema', () => {
  it('parses a valid concern', () => {
    expect(ConcernSchema.parse(validConcern)).toEqual(validConcern);
  });

  it('rejects an unknown extra field (strict)', () => {
    expect(() =>
      ConcernSchema.parse({ ...validConcern, owner: 'backend-fixer' }),
    ).toThrow();
  });

  it('rejects an invalid severity', () => {
    expect(() =>
      ConcernSchema.parse({ ...validConcern, severity: 'CRITICAL' }),
    ).toThrow();
  });

  it('rejects an empty ruleFamily', () => {
    expect(() =>
      ConcernSchema.parse({ ...validConcern, ruleFamily: '' }),
    ).toThrow();
  });
});

describe('FCSResultSchema', () => {
  it('parses a valid FCSResult', () => {
    expect(FCSResultSchema.parse(validResult)).toEqual(validResult);
  });

  it('accepts an empty topConcerns array (score=100 happy path)', () => {
    const happy = {
      ...validResult,
      score: 100,
      lower: 95,
      upper: 100,
      uncertainty: 5,
      status: 'READY' as const,
      topConcerns: [],
      rationale: 'No blockers.',
    };
    expect(FCSResultSchema.parse(happy)).toEqual(happy);
  });

  it('rejects topConcerns with more than 3 entries', () => {
    const c = validConcern;
    expect(() =>
      FCSResultSchema.parse({ ...validResult, topConcerns: [c, c, c, c] }),
    ).toThrow();
  });

  it('rejects score out of 0~100 range', () => {
    expect(() =>
      FCSResultSchema.parse({ ...validResult, score: 101 }),
    ).toThrow();
    expect(() =>
      FCSResultSchema.parse({ ...validResult, score: -1 }),
    ).toThrow();
  });

  it('rejects uncertainty > 30', () => {
    expect(() =>
      FCSResultSchema.parse({ ...validResult, uncertainty: 31 }),
    ).toThrow();
  });

  it('rejects unknown extra field on FCSResult (strict)', () => {
    expect(() =>
      FCSResultSchema.parse({ ...validResult, debug: true }),
    ).toThrow();
  });

  it('rejects empty rationale string', () => {
    expect(() =>
      FCSResultSchema.parse({ ...validResult, rationale: '' }),
    ).toThrow();
  });

  it('rejects an invalid LaunchStatus value', () => {
    expect(() =>
      FCSResultSchema.parse({ ...validResult, status: 'SHIP_IT' }),
    ).toThrow();
  });
});
