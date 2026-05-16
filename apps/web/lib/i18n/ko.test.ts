// Korean i18n integrity tests — sibling-located on purpose (review-gate hook
// only treats `<name>.test.ts` adjacent to `<name>.ts` as proof-of-coverage).
//
// The map is hand-curated, so the test guards against accidental key removal
// (which would surface as a runtime undefined render in production) rather
// than against translation quality.

import { describe, it, expect } from 'vitest';
import { ko } from './ko.js';

describe('ko (Korean i18n map)', () => {
  it('exports a non-empty flat key→string map', () => {
    const keys = Object.keys(ko);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(typeof k).toBe('string');
      expect(typeof (ko as Record<string, unknown>)[k]).toBe('string');
    }
  });

  it('includes the load-bearing brand + hero keys', () => {
    // These keys are referenced by the marketing hero and the app shell —
    // if any go missing the homepage renders blank text.
    const required = [
      'app.title',
      'app.brand',
      'app.tagline',
      'nav.home',
      'nav.audits',
      'home.hero.title',
      'home.hero.subtitle',
      'home.form.repoUrl.label',
    ];
    for (const k of required) {
      expect(ko).toHaveProperty(k);
      expect((ko as Record<string, string>)[k]).not.toBe('');
    }
  });

  it('uses dot-separated ASCII keys (no Korean in keys)', () => {
    const nonAsciiKey = /[^\x20-\x7E]/;
    for (const k of Object.keys(ko)) {
      expect(nonAsciiKey.test(k)).toBe(false);
    }
  });
});
