// English i18n integrity tests. The map is hand-translated, so these tests
// guard the en↔ko key set in lockstep: any new key added to ko.ts that's
// missing from en.ts (or vice versa) fails CI before reaching a UI render.

import { describe, it, expect } from 'vitest';
import { ko } from './ko.js';
import { en } from './en.js';

describe('en (English i18n map)', () => {
  it('exports a non-empty flat key→string map', () => {
    const keys = Object.keys(en);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(typeof k).toBe('string');
      expect(typeof (en as Record<string, unknown>)[k]).toBe('string');
    }
  });

  it('has the exact same key set as ko (parity)', () => {
    const koKeys = Object.keys(ko).sort();
    const enKeys = Object.keys(en).sort();
    expect(enKeys).toEqual(koKeys);
  });

  it('has no empty-string values', () => {
    for (const [k, v] of Object.entries(en)) {
      expect(v, `en[${k}] is empty`).not.toBe('');
    }
  });

  it('uses dot-separated ASCII keys (no non-ASCII in keys)', () => {
    const nonAsciiKey = /[^\x20-\x7E]/;
    for (const k of Object.keys(en)) {
      expect(nonAsciiKey.test(k)).toBe(false);
    }
  });

  it('includes the load-bearing brand + hero keys', () => {
    const required = [
      'app.title',
      'app.brand',
      'app.tagline',
      'nav.home',
      'nav.audits',
      'home.hero.title',
      'home.hero.subtitle',
      'home.form.repoUrl.label',
      'findings.detail.evidences.truncated',
    ];
    for (const k of required) {
      expect(en).toHaveProperty(k);
      expect((en as Record<string, string>)[k]).not.toBe('');
    }
  });
});
