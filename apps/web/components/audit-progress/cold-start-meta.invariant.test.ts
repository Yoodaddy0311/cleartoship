// Invariant guard: STEP_ETA_SEC must contain an entry for every AuditStep.
//
// Lives in a separate file from cold-start-meta.test.tsx because that file
// mocks `@cleartoship/shared-types` AUDIT_STEPS down to 5 entries to keep the
// pure-helper assertions readable. Here we import the REAL AUDIT_STEPS and
// the REAL STEP_ETA_SEC so any new step added to the pipeline (e.g.
// ANALYZE_PRD #109, ANALYZE_BUSINESS_READINESS #118) forces an ETA estimate
// to be supplied — preventing silent N/A in the progress screen ETA badge.

import { describe, it, expect } from 'vitest';
import { AUDIT_STEPS } from '@cleartoship/shared-types';
import { STEP_ETA_SEC } from './cold-start-meta.js';

describe('STEP_ETA_SEC invariant', () => {
  it('has one entry per AUDIT_STEPS member (count parity)', () => {
    expect(Object.keys(STEP_ETA_SEC)).toHaveLength(AUDIT_STEPS.length);
  });

  it('covers every AUDIT_STEPS member with a positive integer ETA', () => {
    for (const step of AUDIT_STEPS) {
      const value = (STEP_ETA_SEC as Record<string, number>)[step];
      expect(value, `STEP_ETA_SEC missing entry for ${step}`).toBeGreaterThan(0);
      expect(Number.isInteger(value), `STEP_ETA_SEC[${step}] must be int`).toBe(true);
    }
  });

  it('has no orphan keys absent from AUDIT_STEPS', () => {
    const stepSet = new Set<string>(AUDIT_STEPS);
    for (const key of Object.keys(STEP_ETA_SEC)) {
      expect(stepSet.has(key), `STEP_ETA_SEC has orphan key ${key}`).toBe(true);
    }
  });

  it('includes ANALYZE_PRD and ANALYZE_BUSINESS_READINESS (regression #137)', () => {
    expect(STEP_ETA_SEC.ANALYZE_PRD).toBeGreaterThan(0);
    expect(STEP_ETA_SEC.ANALYZE_BUSINESS_READINESS).toBeGreaterThan(0);
  });
});
