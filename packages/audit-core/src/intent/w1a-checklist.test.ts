import { describe, expect, it } from 'vitest';
import {
  W1A_CHECKLIST,
  W1A_GROUP_TAG,
  W1A_TAG_PREFIX_REGEX,
  type W1AEvidence,
  type W1AEvidenceKey,
  buildW1AFindings,
  evaluateW1AItem,
  evaluateW1AChecklist,
  getW1AItem,
  isW1AId,
} from './w1a-checklist.js';

const ALL_PRESENT: W1AEvidence = {
  README_PRESENT: true,
  PACKAGE_SCRIPTS_PRESENT: true,
  LICENSE_PRESENT: true,
  CI_CONFIG_PRESENT: true,
  TESTS_DIR_PRESENT: true,
};

const ALL_ABSENT: W1AEvidence = {
  README_PRESENT: false,
  PACKAGE_SCRIPTS_PRESENT: false,
  LICENSE_PRESENT: false,
  CI_CONFIG_PRESENT: false,
  TESTS_DIR_PRESENT: false,
};

describe('W1-A launch readiness checklist', () => {
  it('exposes the group tag W1-A', () => {
    expect(W1A_GROUP_TAG).toBe('W1-A');
  });

  it('declares exactly 5 items with sequential IDs W1-A1..W1-A5', () => {
    expect(W1A_CHECKLIST).toHaveLength(5);
    W1A_CHECKLIST.forEach((item, idx) => {
      expect(item.id).toBe(`W1-A${idx + 1}`);
    });
  });

  it('every item has a measuredBy.evidence-key (no undefined)', () => {
    for (const item of W1A_CHECKLIST) {
      expect(item.measuredBy.type).toBe('evidence-key');
      expect(item.measuredBy.key.length).toBeGreaterThan(0);
    }
  });

  it('maps W1-A1..A5 to the expected evidence keys', () => {
    const byId: Record<string, W1AEvidenceKey> = {};
    for (const item of W1A_CHECKLIST) byId[item.id] = item.measuredBy.key;
    expect(byId['W1-A1']).toBe('README_PRESENT');
    expect(byId['W1-A2']).toBe('PACKAGE_SCRIPTS_PRESENT');
    expect(byId['W1-A3']).toBe('LICENSE_PRESENT');
    expect(byId['W1-A4']).toBe('CI_CONFIG_PRESENT');
    expect(byId['W1-A5']).toBe('TESTS_DIR_PRESENT');
  });

  it('evaluateW1AItem returns PASS when evidence is true', () => {
    for (const item of W1A_CHECKLIST) {
      expect(evaluateW1AItem(item, ALL_PRESENT).status).toBe('PASS');
    }
  });

  it('evaluateW1AItem returns FAIL when evidence is false', () => {
    for (const item of W1A_CHECKLIST) {
      expect(evaluateW1AItem(item, ALL_ABSENT).status).toBe('FAIL');
    }
  });

  it('evaluateW1AItem never returns INDETERMINATE for a known evidence key', () => {
    for (const item of W1A_CHECKLIST) {
      const result = evaluateW1AItem(item, ALL_PRESENT);
      expect(result.status).not.toBe('INDETERMINATE');
    }
  });

  it('evaluateW1AItem result preserves item id and the resolved evidence key', () => {
    const item = W1A_CHECKLIST[0]!;
    const result = evaluateW1AItem(item, ALL_PRESENT);
    expect(result.id).toBe(item.id);
    expect(result.evidenceKey).toBe(item.measuredBy.key);
  });

  it('evaluateW1AChecklist returns 5 results in declared order', () => {
    const results = evaluateW1AChecklist(ALL_PRESENT);
    expect(results).toHaveLength(5);
    results.forEach((r, idx) => expect(r.id).toBe(`W1-A${idx + 1}`));
    for (const r of results) expect(r.status).toBe('PASS');
  });

  it('evaluateW1AChecklist returns mixed PASS/FAIL when evidence is partial', () => {
    const mixed: W1AEvidence = {
      README_PRESENT: true,
      PACKAGE_SCRIPTS_PRESENT: false,
      LICENSE_PRESENT: true,
      CI_CONFIG_PRESENT: false,
      TESTS_DIR_PRESENT: true,
    };
    const results = evaluateW1AChecklist(mixed);
    const byId = new Map(results.map((r) => [r.id, r.status]));
    expect(byId.get('W1-A1')).toBe('PASS');
    expect(byId.get('W1-A2')).toBe('FAIL');
    expect(byId.get('W1-A3')).toBe('PASS');
    expect(byId.get('W1-A4')).toBe('FAIL');
    expect(byId.get('W1-A5')).toBe('PASS');
  });

  it('getW1AItem returns metadata or undefined for unknown id', () => {
    const item = getW1AItem('W1-A1');
    expect(item).toBeDefined();
    expect(item!.label.length).toBeGreaterThan(0);
    expect(item!.description.length).toBeGreaterThan(0);
    expect(getW1AItem('W1-A999')).toBeUndefined();
    expect(getW1AItem('W1-B1')).toBeUndefined();
  });

  it('isW1AId distinguishes W1-A tags from siblings', () => {
    expect(isW1AId('W1-A1')).toBe(true);
    expect(isW1AId('W1-A5')).toBe(true);
    expect(isW1AId('W1-A')).toBe(false);
    expect(isW1AId('W1-B1')).toBe(false);
    expect(isW1AId('W2-A1')).toBe(false);
    expect(isW1AId('readme')).toBe(false);
  });

  it('W1A_TAG_PREFIX_REGEX accepts only W1-A<digits>', () => {
    expect(W1A_TAG_PREFIX_REGEX.test('W1-A1')).toBe(true);
    expect(W1A_TAG_PREFIX_REGEX.test('W1-A12')).toBe(true);
    expect(W1A_TAG_PREFIX_REGEX.test('W1-Ax')).toBe(false);
    expect(W1A_TAG_PREFIX_REGEX.test('W1-A')).toBe(false);
  });

  // T1.2-FU — buildW1AFindings
  it('buildW1AFindings emits zero findings when all evidence is true', () => {
    expect(buildW1AFindings(ALL_PRESENT)).toEqual([]);
  });

  it('buildW1AFindings emits one P2 finding per FAIL with W1-A + W1-A<n> tags', () => {
    const findings = buildW1AFindings(ALL_ABSENT);
    expect(findings).toHaveLength(5);
    for (const f of findings) {
      expect(f.severity).toBe('P2');
      expect(f.confidence).toBe('HIGH');
      expect(f.category).toBe('MAINTAINABILITY_DOCUMENTATION');
      expect(f.tags).toContain(W1A_GROUP_TAG);
      expect(f.tags.some((t) => W1A_TAG_PREFIX_REGEX.test(t))).toBe(true);
      expect(f.title.length).toBeGreaterThan(0);
      expect(f.recommendation).not.toBeNull();
      expect(f.acceptanceCriteria.length).toBeGreaterThan(0);
    }
  });

  it('buildW1AFindings emits findings only for FAIL items, never for PASS items', () => {
    const mixed: W1AEvidence = {
      README_PRESENT: false,
      PACKAGE_SCRIPTS_PRESENT: true,
      LICENSE_PRESENT: false,
      CI_CONFIG_PRESENT: true,
      TESTS_DIR_PRESENT: true,
    };
    const findings = buildW1AFindings(mixed);
    const ids = findings.flatMap((f) => f.tags.filter((t) => W1A_TAG_PREFIX_REGEX.test(t)));
    expect(ids).toEqual(expect.arrayContaining(['W1-A1', 'W1-A3']));
    expect(ids).not.toContain('W1-A2');
    expect(ids).not.toContain('W1-A4');
    expect(ids).not.toContain('W1-A5');
  });
});
