// T2.7 RULE_FAMILY_EXPLANATIONS — verifies the 40+ family dictionary covers
// every AuditCategory, exposes complete KO/EN wording, and that the
// explainRuleFamily resolver picks the right entry for canonical tool rule
// ids (semgrep, eslint, axe, lighthouse).
//
// Why these specific assertions:
//   - Count guard (>=40): Task #117 expansion target. Avoids accidental
//     regression if a future edit drops entries.
//   - Category coverage: AuditCategory has 11 literals — the dictionary must
//     hit every one so L3 explainer never returns "no family" for a known
//     audit dimension.
//   - Id uniqueness: ids are used as analytics dimensions; duplicates would
//     silently corrupt rollups.
//   - KO/EN non-empty: prevents a future editor from leaving an `''` that
//     would render an empty bubble in the UI.

import { describe, expect, it } from 'vitest';
import { AuditCategory } from '@cleartoship/shared-types';
import {
  RULE_FAMILY_EXPLANATIONS,
  explainRuleFamily,
  resolveRuleFamilyLocale,
  type RuleFamilyExplanation,
} from './rule-family-explanations.js';

describe('RULE_FAMILY_EXPLANATIONS — dictionary shape', () => {
  it('contains at least 40 families (Task #117 expansion target)', () => {
    expect(RULE_FAMILY_EXPLANATIONS.length).toBeGreaterThanOrEqual(40);
  });

  it('every entry has a non-empty id, KO/EN displayName + summary', () => {
    for (const entry of RULE_FAMILY_EXPLANATIONS) {
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.displayName_ko.length).toBeGreaterThan(0);
      expect(entry.displayName_en.length).toBeGreaterThan(0);
      expect(entry.summary_ko.length).toBeGreaterThan(0);
      expect(entry.summary_en.length).toBeGreaterThan(0);
    }
  });

  it('ids are unique (used as analytics dimension keys)', () => {
    const ids = RULE_FAMILY_EXPLANATIONS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every entry exposes a RegExp pattern', () => {
    for (const entry of RULE_FAMILY_EXPLANATIONS) {
      expect(entry.pattern).toBeInstanceOf(RegExp);
    }
  });

  it('KO and EN strings actually differ per entry (translation sanity check)', () => {
    // Catches copy-paste accidents where the EN slot was filled with Korean
    // text. Allowed exceptions: none currently — every entry has distinct
    // wording. If a brand name ever needs to be identical in both locales,
    // relax this check for that specific id rather than removing the test.
    for (const entry of RULE_FAMILY_EXPLANATIONS) {
      expect(entry.displayName_en).not.toBe(entry.displayName_ko);
      expect(entry.summary_en).not.toBe(entry.summary_ko);
    }
  });
});

describe('RULE_FAMILY_EXPLANATIONS — category coverage', () => {
  it('covers every AuditCategory enum literal at least once', () => {
    const covered = new Set(RULE_FAMILY_EXPLANATIONS.map((e) => e.category));
    for (const cat of AuditCategory.options) {
      expect(covered.has(cat)).toBe(true);
    }
  });

  it('every entry.category is a valid AuditCategory literal', () => {
    const valid = new Set<string>(AuditCategory.options);
    for (const entry of RULE_FAMILY_EXPLANATIONS) {
      expect(valid.has(entry.category)).toBe(true);
    }
  });
});

describe('explainRuleFamily — resolver', () => {
  it('matches canonical semgrep SQLi rule id to sql-injection family', () => {
    const r = explainRuleFamily('javascript.lang.security.audit.sqli.tagged-template');
    expect(r?.id).toBe('sql-injection');
    expect(r?.category).toBe('SECURITY_PRIVACY');
  });

  it('matches canonical XSS rule id to xss family', () => {
    const r = explainRuleFamily('javascript.react.security.audit.react-href-injection-xss');
    expect(r?.id).toBe('xss');
  });

  it('matches eslint react-hooks rule to frontend-react-hooks family', () => {
    const r = explainRuleFamily('react-hooks/exhaustive-deps');
    expect(r?.id).toBe('frontend-react-hooks');
    expect(r?.category).toBe('FRONTEND_CODE');
  });

  it('matches lighthouse LCP audit to launch-perf-lcp family', () => {
    const r = explainRuleFamily('largest-contentful-paint');
    expect(r?.id).toBe('launch-perf-lcp');
    expect(r?.category).toBe('LAUNCH_READINESS');
  });

  it('matches axe color-contrast rule to a11y-color-contrast family', () => {
    const r = explainRuleFamily('axe-color-contrast');
    expect(r?.id).toBe('a11y-color-contrast');
    expect(r?.category).toBe('UX_UI');
  });

  it('returns null when nothing matches (caller decides fallback)', () => {
    expect(explainRuleFamily('totally-unknown-rule-id-12345')).toBeNull();
  });

  it('defaults to Korean strings when locale arg is omitted', () => {
    const r = explainRuleFamily('sql-injection-test');
    expect(r?.displayName).toBe('SQL 인젝션');
  });

  it('returns English strings when locale=en is requested', () => {
    const r = explainRuleFamily('sql-injection-test', 'en');
    expect(r?.displayName).toBe('SQL Injection');
  });

  it('includes learnMoreUrl when the family declares one', () => {
    const r = explainRuleFamily('javascript.lang.security.audit.sqli.x');
    expect(r?.learnMoreUrl).toBe('https://owasp.org/www-community/attacks/SQL_Injection');
  });

  it('omits learnMoreUrl when the family does not declare one', () => {
    // path-traversal entry intentionally has no learnMoreUrl.
    const r = explainRuleFamily('path-traversal-x');
    expect(r?.learnMoreUrl).toBeUndefined();
  });

  it('most-specific category rules win over the generic security-audit catch-all', () => {
    // The xss entry must beat the generic "security-audit" catch-all even
    // though both could plausibly match a string containing "audit".
    const r = explainRuleFamily('react.security.audit.xss-href');
    expect(r?.id).toBe('xss');
    expect(r?.id).not.toBe('security-generic-audit');
  });

  it('case-insensitive matching on rule ids', () => {
    expect(explainRuleFamily('SQL-INJECTION-X')?.id).toBe('sql-injection');
    expect(explainRuleFamily('Csrf-Token-Missing')?.id).toBe('csrf');
  });
});

describe('resolveRuleFamilyLocale', () => {
  it('returns ko for any ko-* BCP47 tag', () => {
    expect(resolveRuleFamilyLocale('ko-KR')).toBe('ko');
    expect(resolveRuleFamilyLocale('ko')).toBe('ko');
    expect(resolveRuleFamilyLocale('KO-kr')).toBe('ko');
  });

  it('returns en for non-Korean tags including unknown / empty', () => {
    expect(resolveRuleFamilyLocale('en-US')).toBe('en');
    expect(resolveRuleFamilyLocale('ja-JP')).toBe('en');
    expect(resolveRuleFamilyLocale('')).toBe('en');
  });

  it('defaults to ko when no argument is supplied (ko-KR is project default)', () => {
    expect(resolveRuleFamilyLocale()).toBe('ko');
  });
});

describe('RULE_FAMILY_EXPLANATIONS — type-level shape', () => {
  // Compile-time guard: a typo in the entry shape would fail TS, not just
  // the runtime tests. Vitest doesn't run TS in strict mode by default, but
  // the project's `pnpm typecheck` does.
  it('is assignable to ReadonlyArray<RuleFamilyExplanation>', () => {
    const arr: ReadonlyArray<RuleFamilyExplanation> = RULE_FAMILY_EXPLANATIONS;
    expect(arr.length).toBe(RULE_FAMILY_EXPLANATIONS.length);
  });
});
