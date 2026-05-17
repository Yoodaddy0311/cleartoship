import { describe, expect, it } from 'vitest';
import {
  BUSINESS_READINESS_CHECKLIST,
  EMPTY_BUSINESS_EVIDENCE,
  W2_BR_GROUP_TAG,
  W2_BR_TAG_PREFIX_REGEX,
  type BusinessEvidence,
  type BusinessEvidenceKey,
  buildBusinessReadinessFindings,
  evaluateBusinessReadinessChecklist,
  evaluateBusinessReadinessItem,
  getBusinessItem,
  isBusinessReadinessId,
} from './business-checklist.js';

const ALL_PRESENT: BusinessEvidence = {
  PRICING_PAGE_PRESENT: true,
  LEGAL_DOCS_PRESENT: true,
  ONBOARDING_FLOW_PRESENT: true,
  SUPPORT_CHANNEL_PRESENT: true,
  ANALYTICS_INSTALLED: true,
};

const ALL_ABSENT: BusinessEvidence = {
  PRICING_PAGE_PRESENT: false,
  LEGAL_DOCS_PRESENT: false,
  ONBOARDING_FLOW_PRESENT: false,
  SUPPORT_CHANNEL_PRESENT: false,
  ANALYTICS_INSTALLED: false,
};

describe('W2-BR business readiness checklist', () => {
  it('exposes the group tag W2-BR', () => {
    expect(W2_BR_GROUP_TAG).toBe('W2-BR');
  });

  it('declares exactly 5 items with sequential IDs W2-BR1..W2-BR5', () => {
    expect(BUSINESS_READINESS_CHECKLIST).toHaveLength(5);
    BUSINESS_READINESS_CHECKLIST.forEach((item, idx) => {
      expect(item.id).toBe(`W2-BR${idx + 1}`);
    });
  });

  it('every item has a measuredBy.evidence-key (no undefined)', () => {
    for (const item of BUSINESS_READINESS_CHECKLIST) {
      expect(item.measuredBy.type).toBe('evidence-key');
      expect(item.measuredBy.key.length).toBeGreaterThan(0);
    }
  });

  it('maps W2-BR1..W2-BR5 to the expected evidence keys', () => {
    const byId: Record<string, BusinessEvidenceKey> = {};
    for (const item of BUSINESS_READINESS_CHECKLIST) byId[item.id] = item.measuredBy.key;
    expect(byId['W2-BR1']).toBe('PRICING_PAGE_PRESENT');
    expect(byId['W2-BR2']).toBe('LEGAL_DOCS_PRESENT');
    expect(byId['W2-BR3']).toBe('ONBOARDING_FLOW_PRESENT');
    expect(byId['W2-BR4']).toBe('SUPPORT_CHANNEL_PRESENT');
    expect(byId['W2-BR5']).toBe('ANALYTICS_INSTALLED');
  });

  it('EMPTY_BUSINESS_EVIDENCE has all 5 keys set to false', () => {
    expect(EMPTY_BUSINESS_EVIDENCE).toEqual({
      PRICING_PAGE_PRESENT: false,
      LEGAL_DOCS_PRESENT: false,
      ONBOARDING_FLOW_PRESENT: false,
      SUPPORT_CHANNEL_PRESENT: false,
      ANALYTICS_INSTALLED: false,
    });
  });

  it('evaluateBusinessReadinessItem returns PASS when evidence is true', () => {
    for (const item of BUSINESS_READINESS_CHECKLIST) {
      expect(evaluateBusinessReadinessItem(item, ALL_PRESENT).status).toBe('PASS');
    }
  });

  it('evaluateBusinessReadinessItem returns FAIL when evidence is false', () => {
    for (const item of BUSINESS_READINESS_CHECKLIST) {
      expect(evaluateBusinessReadinessItem(item, ALL_ABSENT).status).toBe('FAIL');
    }
  });

  it('evaluateBusinessReadinessItem preserves item id and resolved evidence key', () => {
    const item = BUSINESS_READINESS_CHECKLIST[0]!;
    const result = evaluateBusinessReadinessItem(item, ALL_PRESENT);
    expect(result.id).toBe(item.id);
    expect(result.evidenceKey).toBe(item.measuredBy.key);
  });

  it('evaluateBusinessReadinessChecklist returns 5 results in declared order', () => {
    const results = evaluateBusinessReadinessChecklist(ALL_PRESENT);
    expect(results).toHaveLength(5);
    results.forEach((r, idx) => expect(r.id).toBe(`W2-BR${idx + 1}`));
    for (const r of results) expect(r.status).toBe('PASS');
  });

  it('evaluateBusinessReadinessChecklist returns mixed PASS/FAIL for partial evidence', () => {
    const mixed: BusinessEvidence = {
      PRICING_PAGE_PRESENT: false,
      LEGAL_DOCS_PRESENT: true,
      ONBOARDING_FLOW_PRESENT: false,
      SUPPORT_CHANNEL_PRESENT: true,
      ANALYTICS_INSTALLED: false,
    };
    const results = evaluateBusinessReadinessChecklist(mixed);
    const byId = new Map(results.map((r) => [r.id, r.status]));
    expect(byId.get('W2-BR1')).toBe('FAIL');
    expect(byId.get('W2-BR2')).toBe('PASS');
    expect(byId.get('W2-BR3')).toBe('FAIL');
    expect(byId.get('W2-BR4')).toBe('PASS');
    expect(byId.get('W2-BR5')).toBe('FAIL');
  });

  it('getBusinessItem returns metadata or undefined for unknown id', () => {
    const item = getBusinessItem('W2-BR1');
    expect(item).toBeDefined();
    expect(item!.label.length).toBeGreaterThan(0);
    expect(item!.description.length).toBeGreaterThan(0);
    expect(getBusinessItem('W2-BR999')).toBeUndefined();
    expect(getBusinessItem('W1-A1')).toBeUndefined();
  });

  it('isBusinessReadinessId distinguishes W2-BR tags from siblings', () => {
    expect(isBusinessReadinessId('W2-BR1')).toBe(true);
    expect(isBusinessReadinessId('W2-BR5')).toBe(true);
    expect(isBusinessReadinessId('W2-BR12')).toBe(true);
    expect(isBusinessReadinessId('W2-BR')).toBe(false);
    expect(isBusinessReadinessId('W2-BRx')).toBe(false);
    expect(isBusinessReadinessId('W1-A1')).toBe(false);
    expect(isBusinessReadinessId('W1-B1')).toBe(false);
    expect(isBusinessReadinessId('pricing')).toBe(false);
  });

  it('W2_BR_TAG_PREFIX_REGEX accepts only W2-BR<digits>', () => {
    expect(W2_BR_TAG_PREFIX_REGEX.test('W2-BR1')).toBe(true);
    expect(W2_BR_TAG_PREFIX_REGEX.test('W2-BR12')).toBe(true);
    expect(W2_BR_TAG_PREFIX_REGEX.test('W2-BRx')).toBe(false);
    expect(W2_BR_TAG_PREFIX_REGEX.test('W2-BR')).toBe(false);
  });

  it('buildBusinessReadinessFindings emits zero findings when all evidence is true', () => {
    expect(buildBusinessReadinessFindings(ALL_PRESENT)).toEqual([]);
  });

  it('buildBusinessReadinessFindings emits one P1 finding per FAIL with W2-BR + W2-BR<n> tags', () => {
    const findings = buildBusinessReadinessFindings(ALL_ABSENT);
    expect(findings).toHaveLength(5);
    for (const f of findings) {
      expect(f.severity).toBe('P1');
      expect(f.confidence).toBe('HIGH');
      expect(f.category).toBe('BUSINESS_READINESS');
      expect(f.tags).toContain(W2_BR_GROUP_TAG);
      expect(f.tags.some((t) => W2_BR_TAG_PREFIX_REGEX.test(t))).toBe(true);
      expect(f.title.length).toBeGreaterThan(0);
      expect(f.nonDeveloperExplanation).not.toBeNull();
      expect(f.recommendation).not.toBeNull();
      expect(f.acceptanceCriteria.length).toBeGreaterThan(0);
    }
  });

  it('buildBusinessReadinessFindings emits findings only for FAIL items, never for PASS items', () => {
    const mixed: BusinessEvidence = {
      PRICING_PAGE_PRESENT: false,
      LEGAL_DOCS_PRESENT: true,
      ONBOARDING_FLOW_PRESENT: true,
      SUPPORT_CHANNEL_PRESENT: true,
      ANALYTICS_INSTALLED: false,
    };
    const findings = buildBusinessReadinessFindings(mixed);
    const ids = findings.flatMap((f) => f.tags.filter((t) => W2_BR_TAG_PREFIX_REGEX.test(t)));
    expect(ids).toEqual(expect.arrayContaining(['W2-BR1', 'W2-BR5']));
    expect(ids).not.toContain('W2-BR2');
    expect(ids).not.toContain('W2-BR3');
    expect(ids).not.toContain('W2-BR4');
  });

  it('buildBusinessReadinessFindings uses Korean impact/recommendation text', () => {
    const findings = buildBusinessReadinessFindings(ALL_ABSENT);
    for (const f of findings) {
      // Korean text presence — every template should contain at least one Hangul character.
      expect(/[\uAC00-\uD7A3]/.test(f.impact ?? '')).toBe(true);
      expect(/[\uAC00-\uD7A3]/.test(f.recommendation ?? '')).toBe(true);
      expect(/[\uAC00-\uD7A3]/.test(f.nonDeveloperExplanation ?? '')).toBe(true);
    }
  });
});
