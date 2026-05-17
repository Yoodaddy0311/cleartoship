import { describe, expect, it } from 'vitest';
import {
  LAUNCH_READINESS_CHECKLIST,
  LAUNCH_READINESS_DEFERRED,
  W1_A1_README,
  evaluateChecklist,
  evaluateChecklistItem,
} from './checklist.js';
import type { AuditEvidence } from './audit-evidence.js';
import { ACTIVE_EVIDENCE_KEYS, hasEvidence } from './audit-evidence.js';

describe('checklist — W1-A1 PoC', () => {
  it('LAUNCH_READINESS_CHECKLIST contains only W1-A1 (PoC scope)', () => {
    expect(LAUNCH_READINESS_CHECKLIST).toHaveLength(1);
    expect(LAUNCH_READINESS_CHECKLIST[0]?.id).toBe('W1-A1');
  });

  it('LAUNCH_READINESS_DEFERRED reserves W1-A2..A5 with stable IDs', () => {
    expect(LAUNCH_READINESS_DEFERRED.map((i) => i.id)).toEqual([
      'W1-A2',
      'W1-A3',
      'W1-A4',
      'W1-A5',
    ]);
  });

  it('W1-A1 measuredBy points at README_PRESENT', () => {
    expect(W1_A1_README.measuredBy.type).toBe('evidence-key');
    expect(W1_A1_README.measuredBy.key).toBe('README_PRESENT');
  });

  it('evaluateChecklistItem → PASS when evidence is true', () => {
    const evidence: AuditEvidence = { README_PRESENT: true };
    expect(evaluateChecklistItem(W1_A1_README, evidence).status).toBe('PASS');
  });

  it('evaluateChecklistItem → FAIL when evidence is explicitly false', () => {
    const evidence: AuditEvidence = { README_PRESENT: false };
    expect(evaluateChecklistItem(W1_A1_README, evidence).status).toBe('FAIL');
  });

  it('evaluateChecklistItem → INDETERMINATE when evidence key is missing', () => {
    expect(evaluateChecklistItem(W1_A1_README, {}).status).toBe('INDETERMINATE');
  });

  it('result preserves id and evidenceKey', () => {
    const result = evaluateChecklistItem(W1_A1_README, { README_PRESENT: true });
    expect(result.id).toBe('W1-A1');
    expect(result.evidenceKey).toBe('README_PRESENT');
  });

  it('evaluateChecklist returns one result per item in declared order', () => {
    const results = evaluateChecklist(LAUNCH_READINESS_CHECKLIST, { README_PRESENT: true });
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('PASS');
  });

  it('ACTIVE_EVIDENCE_KEYS reflects PoC scope (README_PRESENT only)', () => {
    expect(ACTIVE_EVIDENCE_KEYS).toEqual(['README_PRESENT']);
  });

  it('hasEvidence distinguishes missing vs explicit false', () => {
    expect(hasEvidence({}, 'README_PRESENT')).toBe(false);
    expect(hasEvidence({ README_PRESENT: false }, 'README_PRESENT')).toBe(true);
    expect(hasEvidence({ README_PRESENT: true }, 'README_PRESENT')).toBe(true);
  });
});
