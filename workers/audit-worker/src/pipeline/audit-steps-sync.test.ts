// Guard rail: keep STEP_REGISTRY, AUDIT_STEPS, and AUDIT_STEP_LABELS_KO
// pointing at the exact same set of steps.
//
// Why this exists:
//   - W1 just toggled `DETECT_FEATURES` on; W3/W4/W5 will add new steps
//     (e.g. DISCOVER_RISKY_FUNCTIONS, ANALYZE_DATA_MODEL). Any divergence
//     between the declared pipeline (AUDIT_STEPS), the actually-registered
//     pipeline (STEP_REGISTRY), and the user-facing labels
//     (AUDIT_STEP_LABELS_KO) silently breaks either the progress UI or the
//     worker run.
//   - This test fails loudly the moment any of those three diverge.
//
// NOTE: the test does NOT require the registry length to equal the declared
// length — during in-flight branches a step may exist in AUDIT_STEPS but
// not yet be implemented. We only assert: every registered step is a
// declared step, and every declared step has a Korean label.

import { describe, expect, it } from 'vitest';
import { AUDIT_STEPS, AUDIT_STEP_LABELS_KO } from '@cleartoship/shared-types';
import { STEP_REGISTRY } from './steps/index.js';

describe('STEP_REGISTRY <-> AUDIT_STEPS sync', () => {
  it('every registered step name is a declared AUDIT_STEPS value', () => {
    const declared = new Set<string>(AUDIT_STEPS);
    const unknownSteps = STEP_REGISTRY.map((s) => s.step).filter(
      (name) => !declared.has(name),
    );
    expect(
      unknownSteps,
      `STEP_REGISTRY contains step names not in AUDIT_STEPS: ${unknownSteps.join(', ')}`,
    ).toEqual([]);
  });

  it('STEP_REGISTRY does not register the same step twice', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const s of STEP_REGISTRY) {
      if (seen.has(s.step)) duplicates.push(s.step);
      seen.add(s.step);
    }
    expect(duplicates).toEqual([]);
  });

  it('every registered step exposes an async execute function', () => {
    for (const s of STEP_REGISTRY) {
      expect(typeof s.execute, `step "${s.step}" missing execute()`).toBe('function');
    }
  });

  it('registered steps appear in the same relative order as AUDIT_STEPS', () => {
    // Allow gaps (a declared step may not yet be registered), but the
    // ordering of the *registered subset* must respect the declared order.
    const declaredOrder = new Map<string, number>(
      AUDIT_STEPS.map((s, i) => [s, i]),
    );
    const indices = STEP_REGISTRY.map((s) => declaredOrder.get(s.step) ?? -1);
    const sorted = [...indices].sort((a, b) => a - b);
    expect(indices).toEqual(sorted);
  });
});

describe('AUDIT_STEPS <-> AUDIT_STEP_LABELS_KO sync', () => {
  it('every AUDIT_STEPS value has a non-empty Korean label', () => {
    for (const step of AUDIT_STEPS) {
      const label = AUDIT_STEP_LABELS_KO[step];
      expect(label, `missing AUDIT_STEP_LABELS_KO entry for "${step}"`).toBeDefined();
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('AUDIT_STEP_LABELS_KO has no orphan keys outside AUDIT_STEPS', () => {
    const declared = new Set<string>(AUDIT_STEPS);
    const orphans = Object.keys(AUDIT_STEP_LABELS_KO).filter(
      (k) => !declared.has(k),
    );
    expect(orphans).toEqual([]);
  });

  it('every registered step has a Korean label (UI never renders undefined)', () => {
    for (const s of STEP_REGISTRY) {
      expect(
        AUDIT_STEP_LABELS_KO[s.step],
        `registered step "${s.step}" has no Korean label`,
      ).toBeTruthy();
    }
  });
});
