import { describe, expect, it } from 'vitest';
import type { AuditCategory } from '@cleartoship/shared-types';
import {
  AUDIT_PROFILES,
  applyProfileWeights,
  getProfile,
  isAuditProfileId,
} from './index.js';

describe('AUDIT_PROFILES catalog', () => {
  it('exposes exactly the four documented profiles (landing/saas/ecommerce/vibe-coded)', () => {
    expect(AUDIT_PROFILES.map((p) => p.id).sort()).toEqual([
      'ecommerce',
      'landing',
      'saas',
      'vibe-coded',
    ]);
  });

  it.each(AUDIT_PROFILES)(
    'profile %# has KO + EN displayName and non-empty emphasizedCategories',
    (profile) => {
      expect(profile.displayName.ko).toBeTruthy();
      expect(profile.displayName.en).toBeTruthy();
      expect(profile.emphasizedCategories.length).toBeGreaterThan(0);
    },
  );

  it.each(AUDIT_PROFILES)(
    'profile %# declares mandatoryEvidence so the dashboard can flag missing artefacts',
    (profile) => {
      expect(profile.mandatoryEvidence.length).toBeGreaterThan(0);
    },
  );
});

describe('getProfile resolver', () => {
  it('returns the profile for a known id', () => {
    expect(getProfile('saas')?.id).toBe('saas');
    expect(getProfile('landing')?.id).toBe('landing');
    expect(getProfile('ecommerce')?.id).toBe('ecommerce');
    expect(getProfile('vibe-coded')?.id).toBe('vibe-coded');
  });

  it('returns null for unknown ids — worker must NOT crash on legacy/typo docs', () => {
    expect(getProfile('marketplace')).toBeNull();
    expect(getProfile('SAAS')).toBeNull(); // case-sensitive — explicit choice
  });

  it('returns null for null / undefined input (no profile selected)', () => {
    expect(getProfile(null)).toBeNull();
    expect(getProfile(undefined)).toBeNull();
  });
});

describe('isAuditProfileId guard', () => {
  it('narrows known string ids', () => {
    expect(isAuditProfileId('saas')).toBe(true);
    expect(isAuditProfileId('landing')).toBe(true);
    expect(isAuditProfileId('ecommerce')).toBe(true);
    expect(isAuditProfileId('vibe-coded')).toBe(true);
  });

  it('rejects unknown / non-string values', () => {
    expect(isAuditProfileId('SAAS')).toBe(false);
    expect(isAuditProfileId('')).toBe(false);
    expect(isAuditProfileId(null)).toBe(false);
    expect(isAuditProfileId(42)).toBe(false);
  });
});

describe('applyProfileWeights', () => {
  const baseEntries: Array<[AuditCategory, number]> = [
    ['PRODUCT_INTENT', 0],
    ['REQUIREMENT_COVERAGE', 0],
    ['FEATURE_GRAPH', 10],
    ['FUNCTIONAL_FLOW', 10],
    ['UX_UI', 15],
    ['FRONTEND_CODE', 10],
    ['BACKEND_API', 15],
    ['DATA_MODEL', 10],
    ['SECURITY_PRIVACY', 15],
    ['LAUNCH_READINESS', 10],
    ['MAINTAINABILITY_DOCUMENTATION', 5],
  ];
  const base = new Map<AuditCategory, number>(baseEntries);

  it('returns the base map unchanged when profile is null (legacy parity)', () => {
    const result = applyProfileWeights(base, null);
    for (const [cat, w] of baseEntries) {
      expect(result.get(cat)).toBe(w);
    }
  });

  it('overrides only the categories listed in weightOverrides', () => {
    const landing = getProfile('landing')!;
    const result = applyProfileWeights(base, landing);
    // Landing emphasises UX_UI (30) and FRONTEND_CODE (20).
    expect(result.get('UX_UI')).toBe(30);
    expect(result.get('FRONTEND_CODE')).toBe(20);
    // Untouched categories keep their base weight.
    expect(result.get('FEATURE_GRAPH')).toBe(10);
    expect(result.get('MAINTAINABILITY_DOCUMENTATION')).toBe(5);
  });

  it('does not mutate the input map (immutability)', () => {
    const saas = getProfile('saas')!;
    applyProfileWeights(base, saas);
    // Base must still match the original entries.
    for (const [cat, w] of baseEntries) {
      expect(base.get(cat)).toBe(w);
    }
  });
});

describe('vibe-coded profile (L-P0-7 / USP-1)', () => {
  const profile = getProfile('vibe-coded')!;

  it('is registered in the catalog and resolvable by id', () => {
    expect(profile).toBeTruthy();
    expect(profile.id).toBe('vibe-coded');
    expect(AUDIT_PROFILES.some((p) => p.id === 'vibe-coded')).toBe(true);
  });

  it('emphasizes the three vibe-coding risk categories (FUNCTIONAL_FLOW / UX_UI / LAUNCH_READINESS)', () => {
    expect([...profile.emphasizedCategories].sort()).toEqual([
      'FUNCTIONAL_FLOW',
      'LAUNCH_READINESS',
      'UX_UI',
    ]);
  });

  it('weightOverrides sum to 100 (preserves CATEGORY_META weight-sum invariant)', () => {
    const total = Object.values(profile.weightOverrides).reduce(
      (acc, w) => acc + (w ?? 0),
      0,
    );
    expect(Math.abs(total - 100)).toBeLessThan(0.001);
  });

  it('keeps BUSINESS_READINESS at weight 0 (default-pass policy)', () => {
    expect(profile.weightOverrides.BUSINESS_READINESS).toBe(0);
  });

  it('forces the W3-F ghost-button heuristic on (deterministic portion only)', () => {
    expect(profile.ghostButtonHeuristicForced).toBe(true);
  });

  it('has KO + EN displayName ("바이브 코딩" / "Vibe-Coded")', () => {
    expect(profile.displayName.ko).toBe('바이브 코딩');
    expect(profile.displayName.en).toBe('Vibe-Coded');
  });

  it('is type-safe under isAuditProfileId guard', () => {
    expect(isAuditProfileId('vibe-coded')).toBe(true);
    expect(isAuditProfileId('vibe_coded')).toBe(false);
    expect(isAuditProfileId('VIBE-CODED')).toBe(false);
  });

  it('other profiles do NOT set ghostButtonHeuristicForced (no regression)', () => {
    for (const id of ['landing', 'saas', 'ecommerce'] as const) {
      const p = getProfile(id)!;
      expect(p.ghostButtonHeuristicForced).toBeUndefined();
    }
  });
});
