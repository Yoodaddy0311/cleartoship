import { describe, it, expect } from 'vitest';
import {
  AuditRunStatus,
  AuditCategory,
  Severity,
  Confidence,
  FindingStatus,
  EvidenceType,
  FeatureNodeType,
  FeatureEdgeType,
  ImplementationStatus,
} from '../enums.js';

/** Helper: assert that every option of a zod enum is an UPPER_SNAKE_CASE token. */
function expectAllUpperSnake(values: readonly string[]): void {
  for (const v of values) {
    expect(v).toMatch(/^[A-Z][A-Z0-9_]*$/);
  }
}

describe('AuditCategory enum', () => {
  it('contains the 12 documented categories', () => {
    const expected = [
      'PRODUCT_INTENT',
      'REQUIREMENT_COVERAGE',
      'FEATURE_GRAPH',
      'FUNCTIONAL_FLOW',
      'UX_UI',
      'FRONTEND_CODE',
      'BACKEND_API',
      'DATA_MODEL',
      'SECURITY_PRIVACY',
      'LAUNCH_READINESS',
      'MAINTAINABILITY_DOCUMENTATION',
      'BUSINESS_READINESS',
    ];
    expect(AuditCategory.options).toEqual(expected);
  });

  it('uses UPPER_SNAKE_CASE for every value', () => {
    expectAllUpperSnake(AuditCategory.options);
  });

  it('parses a valid category and rejects unknown ones', () => {
    expect(AuditCategory.parse('PRODUCT_INTENT')).toBe('PRODUCT_INTENT');
    expect(() => AuditCategory.parse('product_intent')).toThrow();
    expect(() => AuditCategory.parse('UNKNOWN_CATEGORY')).toThrow();
  });
});

describe('Severity enum', () => {
  it('contains exactly P0..P3', () => {
    expect(Severity.options).toEqual(['P0', 'P1', 'P2', 'P3']);
  });

  it('rejects values outside the ladder', () => {
    expect(Severity.parse('P0')).toBe('P0');
    expect(() => Severity.parse('CRITICAL')).toThrow();
    expect(() => Severity.parse('p0')).toThrow();
  });
});

describe('AuditRunStatus enum', () => {
  it('covers the full lifecycle', () => {
    expect(AuditRunStatus.options).toEqual([
      'PENDING',
      'RUNNING',
      'COMPLETED',
      'FAILED',
      'CANCELLED',
    ]);
  });

  it('values are UPPER_SNAKE_CASE', () => {
    expectAllUpperSnake(AuditRunStatus.options);
  });
});

describe('Confidence enum', () => {
  it('has 3 tiers in descending order', () => {
    expect(Confidence.options).toEqual(['HIGH', 'MEDIUM', 'LOW']);
  });
});

describe('FindingStatus enum', () => {
  it('exposes the 4 documented statuses', () => {
    expect(FindingStatus.options).toEqual([
      'OPEN',
      'ACKNOWLEDGED',
      'RESOLVED',
      'FALSE_POSITIVE',
    ]);
  });
});

describe('EvidenceType enum', () => {
  it('contains 12 evidence types', () => {
    expect(EvidenceType.options).toHaveLength(12);
    expect(EvidenceType.options).toContain('CODE_SNIPPET');
    expect(EvidenceType.options).toContain('SEMGREP');
  });

  it('uses UPPER_SNAKE_CASE for every type', () => {
    expectAllUpperSnake(EvidenceType.options);
  });
});

describe('FeatureNodeType enum', () => {
  it('contains exactly 11 node types from spec §3', () => {
    expect(FeatureNodeType.options).toHaveLength(11);
    expect(FeatureNodeType.options).toContain('feature');
    expect(FeatureNodeType.options).toContain('recommended_feature');
  });

  it('uses lower_snake_case (graph token style)', () => {
    for (const v of FeatureNodeType.options) {
      expect(v).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});

describe('FeatureEdgeType enum', () => {
  it('contains exactly 11 edge types from spec §4', () => {
    expect(FeatureEdgeType.options).toHaveLength(11);
    expect(FeatureEdgeType.options).toContain('calls_api');
    expect(FeatureEdgeType.options).toContain('missing_link');
  });
});

describe('ImplementationStatus enum', () => {
  it('contains exactly 9 statuses from spec §5', () => {
    expect(ImplementationStatus.options).toHaveLength(9);
    expect(ImplementationStatus.options).toContain('complete');
    expect(ImplementationStatus.options).toContain('missing');
    expect(ImplementationStatus.options).toContain('unknown');
  });
});

describe('enum option uniqueness invariant', () => {
  it('has no duplicate values within any enum', () => {
    const enums = [
      AuditRunStatus,
      AuditCategory,
      Severity,
      Confidence,
      FindingStatus,
      EvidenceType,
      FeatureNodeType,
      FeatureEdgeType,
      ImplementationStatus,
    ];
    for (const e of enums) {
      const opts = e.options as readonly string[];
      expect(new Set(opts).size).toBe(opts.length);
    }
  });
});
