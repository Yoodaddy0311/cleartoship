import { describe, expect, it } from 'vitest';
import {
  PRD_CLAIM_KEYS,
  PRD_KEYWORD_MAP,
  W2C_GROUP_TAG,
  type PrdAnalysis,
  type PrdClaimKey,
  analyzePrdText,
  buildClaimMismatchFindings,
  emptyPrdAnalysis,
  mergePrdAnalyses,
} from './prd-analysis.js';

describe('PRD keyword analysis (T2.1 / W2-C)', () => {
  it('exposes the 4 claim keys in a stable order', () => {
    expect(PRD_CLAIM_KEYS).toEqual([
      'mvpClaimed',
      'alphaClaimed',
      'betaClaimed',
      'productionClaimed',
    ]);
  });

  it('every claim key has at least one en + one ko keyword in the map', () => {
    for (const key of PRD_CLAIM_KEYS) {
      const entries = PRD_KEYWORD_MAP[key];
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.some((e) => e.locale === 'en-US')).toBe(true);
      expect(entries.some((e) => e.locale === 'ko-KR')).toBe(true);
    }
  });

  it('emptyPrdAnalysis returns all-false claims', () => {
    const a = emptyPrdAnalysis();
    expect(a.mvpClaimed).toBe(false);
    expect(a.alphaClaimed).toBe(false);
    expect(a.betaClaimed).toBe(false);
    expect(a.productionClaimed).toBe(false);
    expect(a.keywords).toEqual([]);
    expect(a.sources).toEqual([]);
  });

  it('analyzePrdText detects "MVP" (en-US) → mvpClaimed', () => {
    const a = analyzePrdText('This project is an MVP for B2B onboarding.', 'README.md');
    expect(a.mvpClaimed).toBe(true);
    expect(a.productionClaimed).toBe(false);
    expect(a.keywords.some((k) => k.claim === 'mvpClaimed' && k.match === 'MVP')).toBe(true);
  });

  it('analyzePrdText detects "Beta" (en-US) → betaClaimed', () => {
    const a = analyzePrdText('Currently in Beta. APIs may change.', 'CHANGELOG.md');
    expect(a.betaClaimed).toBe(true);
    expect(a.productionClaimed).toBe(false);
  });

  it('analyzePrdText detects "Production-ready" → productionClaimed', () => {
    const a = analyzePrdText('Production-ready release. Stable API.', 'README.md');
    expect(a.productionClaimed).toBe(true);
    expect(a.mvpClaimed).toBe(false);
  });

  it('analyzePrdText detects "출시 준비" (ko-KR) → productionClaimed', () => {
    const a = analyzePrdText('이 프로젝트는 출시 준비를 마쳤습니다.', 'README.md');
    expect(a.productionClaimed).toBe(true);
  });

  it('analyzePrdText detects "베타" (ko-KR) → betaClaimed', () => {
    const a = analyzePrdText('현재 베타 단계 — 피드백 환영합니다.', 'README.md');
    expect(a.betaClaimed).toBe(true);
  });

  it('analyzePrdText is case-insensitive', () => {
    const a = analyzePrdText('mvp build for early users', 'README.md');
    expect(a.mvpClaimed).toBe(true);
  });

  it('analyzePrdText is empty for unrelated text', () => {
    const a = analyzePrdText('A library for parsing dates.', 'README.md');
    expect(a.mvpClaimed).toBe(false);
    expect(a.betaClaimed).toBe(false);
    expect(a.productionClaimed).toBe(false);
    expect(a.alphaClaimed).toBe(false);
    expect(a.keywords).toEqual([]);
  });

  it('analyzePrdText records source path in sources[]', () => {
    const a = analyzePrdText('MVP build.', 'docs/PRD.md');
    expect(a.sources).toContain('docs/PRD.md');
  });

  it('analyzePrdText does NOT count substring inside a longer word ("alphabet" ≠ alpha)', () => {
    // word-boundary safeguard: "alpha" 단어로만 매칭, "alphabet" 같은 큰 단어 안에선 매칭 X.
    const a = analyzePrdText('Read the alphabet to your child.', 'README.md');
    expect(a.alphaClaimed).toBe(false);
  });

  it('mergePrdAnalyses OR-merges claim flags and concatenates keywords/sources', () => {
    const a = analyzePrdText('MVP build.', 'README.md');
    const b = analyzePrdText('Beta.', 'CHANGELOG.md');
    const m = mergePrdAnalyses([a, b]);
    expect(m.mvpClaimed).toBe(true);
    expect(m.betaClaimed).toBe(true);
    expect(m.sources).toEqual(expect.arrayContaining(['README.md', 'CHANGELOG.md']));
    expect(m.keywords.length).toBeGreaterThanOrEqual(2);
  });
});

describe('buildClaimMismatchFindings (T2.1 / W2-C)', () => {
  const baseSignals = {
    w1aAllPass: true,
    severityCountsP0: 0,
  };

  it('emits zero findings when no claims are made', () => {
    const findings = buildClaimMismatchFindings(emptyPrdAnalysis(), baseSignals);
    expect(findings).toEqual([]);
  });

  it('emits zero findings when productionClaimed + everything green', () => {
    const a: PrdAnalysis = { ...emptyPrdAnalysis(), productionClaimed: true };
    const findings = buildClaimMismatchFindings(a, baseSignals);
    expect(findings).toEqual([]);
  });

  it('emits P1 finding when productionClaimed but W1-A not all PASS', () => {
    const a: PrdAnalysis = { ...emptyPrdAnalysis(), productionClaimed: true };
    const findings = buildClaimMismatchFindings(a, { ...baseSignals, w1aAllPass: false });
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.severity).toBe('P1');
    expect(f.confidence).toBe('MEDIUM');
    expect(f.category).toBe('MAINTAINABILITY_DOCUMENTATION');
    expect(f.tags).toEqual(expect.arrayContaining([W2C_GROUP_TAG, 'CLAIM_MISMATCH']));
  });

  it('emits P1 finding when productionClaimed but P0 > 0', () => {
    const a: PrdAnalysis = { ...emptyPrdAnalysis(), productionClaimed: true };
    const findings = buildClaimMismatchFindings(a, { ...baseSignals, severityCountsP0: 3 });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('P1');
    expect(findings[0]!.tags).toContain('PRODUCTION_VS_P0');
  });

  it('emits both mismatch findings when production claim + W1-A FAIL + P0', () => {
    const a: PrdAnalysis = { ...emptyPrdAnalysis(), productionClaimed: true };
    const findings = buildClaimMismatchFindings(a, { w1aAllPass: false, severityCountsP0: 2 });
    expect(findings.length).toBe(2);
    expect(findings.every((f) => f.severity === 'P1')).toBe(true);
  });

  it('mvpClaimed + P0 > 0 emits P2 advisory finding (lower severity than production)', () => {
    const a: PrdAnalysis = { ...emptyPrdAnalysis(), mvpClaimed: true };
    const findings = buildClaimMismatchFindings(a, { ...baseSignals, severityCountsP0: 1 });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('P2');
    expect(findings[0]!.tags).toContain('MVP_VS_P0');
  });

  it('betaClaimed alone never emits a finding (normal stage)', () => {
    const a: PrdAnalysis = { ...emptyPrdAnalysis(), betaClaimed: true };
    const findings = buildClaimMismatchFindings(a, { w1aAllPass: false, severityCountsP0: 5 });
    expect(findings).toEqual([]);
  });

  it('every emitted finding carries W2-C group tag', () => {
    const a: PrdAnalysis = { ...emptyPrdAnalysis(), productionClaimed: true };
    const findings = buildClaimMismatchFindings(a, { w1aAllPass: false, severityCountsP0: 1 });
    for (const f of findings) {
      expect(f.tags).toContain(W2C_GROUP_TAG);
      expect(f.title.length).toBeGreaterThan(0);
      expect(f.recommendation).not.toBeNull();
      expect(f.acceptanceCriteria.length).toBeGreaterThan(0);
    }
  });

  it('PrdClaimKey type covers exactly 4 keys', () => {
    const keys: PrdClaimKey[] = ['mvpClaimed', 'alphaClaimed', 'betaClaimed', 'productionClaimed'];
    expect(keys.length).toBe(4);
  });
});
