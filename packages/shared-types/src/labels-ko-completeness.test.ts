// Regression safety net for U1's label-coverage work.
//
// `labels-ko.test.ts` already covers each map individually. This file is a
// table-driven companion: it iterates over every (enum, label-map) pair in
// a single matrix and asserts both directions — no missing keys, no extra
// keys, no empty values — so any future enum/label addition is enforced
// with a single uniform check.
//
// The aim is to make label drift impossible to ship: if W3/W4/W5 adds an
// AUDIT_STEPS entry or U1 adds a new enum literal, this file fails until
// the matching Korean label is added.

import { describe, expect, it } from 'vitest';
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
import { AUDIT_STEPS, AUDIT_STEP_LABELS_KO } from './audit-steps.js';
import { LaunchStatus, LAUNCH_STATUS_LABELS_KO } from './domain.js';

interface LabelMapCase {
  name: string;
  values: readonly string[];
  map: Record<string, unknown>;
  /** When the map's values are objects shaped { label, description }. */
  shape: 'string' | 'labelWithDescription';
}

const cases: LabelMapCase[] = [
  {
    name: 'SEVERITY_LABELS_KO',
    values: Severity.options,
    map: SEVERITY_LABELS_KO,
    shape: 'labelWithDescription',
  },
  {
    name: 'SEVERITY_COLOR_TOKEN',
    values: Severity.options,
    map: SEVERITY_COLOR_TOKEN,
    shape: 'string',
  },
  {
    name: 'AUDIT_CATEGORY_LABELS_KO',
    values: AuditCategory.options,
    map: AUDIT_CATEGORY_LABELS_KO,
    shape: 'labelWithDescription',
  },
  {
    name: 'IMPLEMENTATION_STATUS_LABELS_KO',
    values: ImplementationStatus.options,
    map: IMPLEMENTATION_STATUS_LABELS_KO,
    shape: 'labelWithDescription',
  },
  {
    name: 'CONFIDENCE_LABELS_KO',
    values: Confidence.options,
    map: CONFIDENCE_LABELS_KO,
    shape: 'string',
  },
  {
    name: 'FINDING_STATUS_LABELS_KO',
    values: FindingStatus.options,
    map: FINDING_STATUS_LABELS_KO,
    shape: 'string',
  },
  {
    name: 'FEATURE_NODE_TYPE_LABELS_KO',
    values: FeatureNodeType.options,
    map: FEATURE_NODE_TYPE_LABELS_KO,
    shape: 'string',
  },
  {
    name: 'FEATURE_EDGE_TYPE_LABELS_KO',
    values: FeatureEdgeType.options,
    map: FEATURE_EDGE_TYPE_LABELS_KO,
    shape: 'string',
  },
  {
    name: 'AUDIT_STEP_LABELS_KO',
    values: AUDIT_STEPS,
    map: AUDIT_STEP_LABELS_KO,
    shape: 'string',
  },
  {
    name: 'LAUNCH_STATUS_LABELS_KO',
    values: LaunchStatus.options,
    map: LAUNCH_STATUS_LABELS_KO,
    shape: 'string',
  },
];

function assertLabelValue(shape: LabelMapCase['shape'], v: unknown, ctx: string): void {
  if (shape === 'string') {
    expect(typeof v, `${ctx}: expected string`).toBe('string');
    expect((v as string).length, `${ctx}: empty string`).toBeGreaterThan(0);
    return;
  }
  expect(v, `${ctx}: nullish`).toBeDefined();
  expect(typeof v, `${ctx}: expected object`).toBe('object');
  const { label, description } = v as { label?: unknown; description?: unknown };
  expect(typeof label, `${ctx}.label`).toBe('string');
  expect((label as string).length, `${ctx}.label empty`).toBeGreaterThan(0);
  expect(typeof description, `${ctx}.description`).toBe('string');
  expect((description as string).length, `${ctx}.description empty`).toBeGreaterThan(0);
}

describe('Korean label completeness — full matrix', () => {
  for (const c of cases) {
    describe(c.name, () => {
      it('covers every enum literal (no missing keys)', () => {
        const missing = c.values.filter(
          (v) => !Object.prototype.hasOwnProperty.call(c.map, v),
        );
        expect(
          missing,
          `${c.name} is missing keys: ${missing.join(', ')}`,
        ).toEqual([]);
      });

      it('has no keys outside the enum (no orphan entries)', () => {
        const declared = new Set<string>(c.values);
        const orphans = Object.keys(c.map).filter((k) => !declared.has(k));
        expect(
          orphans,
          `${c.name} has orphan keys: ${orphans.join(', ')}`,
        ).toEqual([]);
      });

      it('each value is non-empty and well-shaped', () => {
        for (const v of c.values) {
          assertLabelValue(c.shape, c.map[v], `${c.name}.${v}`);
        }
      });

      it('key set sorted-equals the enum value set', () => {
        const keys = Object.keys(c.map).sort();
        const expected = [...c.values].sort();
        expect(keys).toEqual(expected);
      });
    });
  }
});
