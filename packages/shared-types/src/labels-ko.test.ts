// Guard rail: each *_LABELS_KO map must cover EVERY value of its enum.
// If someone adds a new enum literal without updating the label map, the UI
// would render `undefined` to non-developer users — these tests catch that.

import { describe, it, expect } from 'vitest';
import {
  AuditCategory,
  Confidence,
  FeatureEdgeType,
  FeatureNodeType,
  FindingStatus,
  ImplementationStatus,
  Severity,
} from './enums.js';
import {
  AUDIT_CATEGORY_LABELS_KO,
  CONFIDENCE_LABELS_KO,
  FEATURE_EDGE_TYPE_LABELS_KO,
  FEATURE_NODE_TYPE_LABELS_KO,
  FINDING_STATUS_LABELS_KO,
  IMPLEMENTATION_STATUS_LABELS_KO,
  SEVERITY_COLOR_TOKEN,
  SEVERITY_LABELS_KO,
} from './labels-ko.js';

// Compile-time exact-key check: `AssertEqual<X, Y>` resolves to `true` only
// when X and Y are mutually assignable. Forces drift to surface as a TS error,
// not just at runtime.
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;
type AssertEqual<X, Y> = Equal<X, Y>;

describe('labels-ko', () => {
  describe('SEVERITY_LABELS_KO', () => {
    it('covers every Severity literal', () => {
      for (const value of Severity.options) {
        const entry = SEVERITY_LABELS_KO[value];
        expect(entry).toBeDefined();
        expect(entry.label.length).toBeGreaterThan(0);
        expect(entry.description.length).toBeGreaterThan(0);
      }
    });

    it('has no extra keys beyond Severity', () => {
      const keys = Object.keys(SEVERITY_LABELS_KO).sort();
      expect(keys).toEqual([...Severity.options].sort());
    });

    it('key set matches Severity at the type level', () => {
      const _check: AssertEqual<keyof typeof SEVERITY_LABELS_KO, Severity> = true;
      expect(_check).toBe(true);
    });
  });

  describe('SEVERITY_COLOR_TOKEN', () => {
    it('covers every Severity literal', () => {
      for (const value of Severity.options) {
        expect(SEVERITY_COLOR_TOKEN[value]).toBeDefined();
        expect(SEVERITY_COLOR_TOKEN[value].length).toBeGreaterThan(0);
      }
    });

    it('has no extra keys beyond Severity', () => {
      const keys = Object.keys(SEVERITY_COLOR_TOKEN).sort();
      expect(keys).toEqual([...Severity.options].sort());
    });
  });

  describe('AUDIT_CATEGORY_LABELS_KO', () => {
    it('covers every AuditCategory literal', () => {
      for (const value of AuditCategory.options) {
        const entry = AUDIT_CATEGORY_LABELS_KO[value];
        expect(entry).toBeDefined();
        expect(entry.label.length).toBeGreaterThan(0);
        expect(entry.description.length).toBeGreaterThan(0);
      }
    });

    it('has no extra keys beyond AuditCategory', () => {
      const keys = Object.keys(AUDIT_CATEGORY_LABELS_KO).sort();
      expect(keys).toEqual([...AuditCategory.options].sort());
    });

    it('key set matches AuditCategory at the type level', () => {
      const _check: AssertEqual<keyof typeof AUDIT_CATEGORY_LABELS_KO, AuditCategory> = true;
      expect(_check).toBe(true);
    });
  });

  describe('IMPLEMENTATION_STATUS_LABELS_KO', () => {
    it('covers every ImplementationStatus literal', () => {
      for (const value of ImplementationStatus.options) {
        const entry = IMPLEMENTATION_STATUS_LABELS_KO[value];
        expect(entry).toBeDefined();
        expect(entry.label.length).toBeGreaterThan(0);
        expect(entry.description.length).toBeGreaterThan(0);
      }
    });

    it('has no extra keys beyond ImplementationStatus', () => {
      const keys = Object.keys(IMPLEMENTATION_STATUS_LABELS_KO).sort();
      expect(keys).toEqual([...ImplementationStatus.options].sort());
    });

    it('key set matches ImplementationStatus at the type level', () => {
      const _check: AssertEqual<
        keyof typeof IMPLEMENTATION_STATUS_LABELS_KO,
        ImplementationStatus
      > = true;
      expect(_check).toBe(true);
    });
  });

  describe('CONFIDENCE_LABELS_KO', () => {
    it('covers every Confidence literal', () => {
      for (const value of Confidence.options) {
        expect(CONFIDENCE_LABELS_KO[value]).toBeDefined();
        expect(CONFIDENCE_LABELS_KO[value].length).toBeGreaterThan(0);
      }
    });

    it('has no extra keys beyond Confidence', () => {
      const keys = Object.keys(CONFIDENCE_LABELS_KO).sort();
      expect(keys).toEqual([...Confidence.options].sort());
    });
  });

  describe('FINDING_STATUS_LABELS_KO', () => {
    it('covers every FindingStatus literal', () => {
      for (const value of FindingStatus.options) {
        expect(FINDING_STATUS_LABELS_KO[value]).toBeDefined();
        expect(FINDING_STATUS_LABELS_KO[value].length).toBeGreaterThan(0);
      }
    });

    it('has no extra keys beyond FindingStatus', () => {
      const keys = Object.keys(FINDING_STATUS_LABELS_KO).sort();
      expect(keys).toEqual([...FindingStatus.options].sort());
    });
  });

  describe('FEATURE_NODE_TYPE_LABELS_KO', () => {
    it('covers every FeatureNodeType literal', () => {
      for (const value of FeatureNodeType.options) {
        expect(FEATURE_NODE_TYPE_LABELS_KO[value]).toBeDefined();
        expect(FEATURE_NODE_TYPE_LABELS_KO[value].length).toBeGreaterThan(0);
      }
    });

    it('has no extra keys beyond FeatureNodeType', () => {
      const keys = Object.keys(FEATURE_NODE_TYPE_LABELS_KO).sort();
      expect(keys).toEqual([...FeatureNodeType.options].sort());
    });
  });

  describe('FEATURE_EDGE_TYPE_LABELS_KO', () => {
    it('covers every FeatureEdgeType literal', () => {
      for (const value of FeatureEdgeType.options) {
        expect(FEATURE_EDGE_TYPE_LABELS_KO[value]).toBeDefined();
        expect(FEATURE_EDGE_TYPE_LABELS_KO[value].length).toBeGreaterThan(0);
      }
    });

    it('has no extra keys beyond FeatureEdgeType', () => {
      const keys = Object.keys(FEATURE_EDGE_TYPE_LABELS_KO).sort();
      expect(keys).toEqual([...FeatureEdgeType.options].sort());
    });
  });
});
