// T1.4 SEVERITY_LANGUAGE_KO — locale-aware severity label/description resolver.
//
// Scope:
//   - SEVERITY_LANGUAGE_KO must cover every Severity enum literal with
//     non-empty label + description.
//   - SEVERITY_LANGUAGE_EN provides en-US fallback (English wording).
//   - getSeverityLanguage(locale) picks ko-KR when the BCP47 tag starts with
//     "ko" and falls back to en-US for everything else (incl. unknown tags).
//   - Existing shared-types/labels-ko.SEVERITY_LABELS_KO values are the source
//     of truth for Korean strings (re-exported, not duplicated).

import { describe, expect, it } from 'vitest';
import { Severity, SEVERITY_LABELS_KO } from '@cleartoship/shared-types';
import {
  SEVERITY_LANGUAGE_KO,
  SEVERITY_LANGUAGE_EN,
  getSeverityLanguage,
} from './severity-ko.js';

describe('SEVERITY_LANGUAGE_KO', () => {
  it('covers every Severity enum literal', () => {
    for (const sev of Severity.options) {
      expect(SEVERITY_LANGUAGE_KO[sev]).toBeDefined();
    }
  });

  it('every entry has a non-empty label and description', () => {
    for (const sev of Severity.options) {
      const entry = SEVERITY_LANGUAGE_KO[sev];
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it('reuses shared-types SEVERITY_LABELS_KO wording (single source of truth)', () => {
    for (const sev of Severity.options) {
      expect(SEVERITY_LANGUAGE_KO[sev].label).toBe(SEVERITY_LABELS_KO[sev].label);
      expect(SEVERITY_LANGUAGE_KO[sev].description).toBe(
        SEVERITY_LABELS_KO[sev].description,
      );
    }
  });

  it('has no orphan keys beyond the Severity enum', () => {
    const declared = new Set<string>(Severity.options);
    const orphans = Object.keys(SEVERITY_LANGUAGE_KO).filter(
      (k) => !declared.has(k),
    );
    expect(orphans).toEqual([]);
  });
});

describe('SEVERITY_LANGUAGE_EN', () => {
  it('covers every Severity enum literal', () => {
    for (const sev of Severity.options) {
      expect(SEVERITY_LANGUAGE_EN[sev]).toBeDefined();
    }
  });

  it('every entry has non-empty English label and description', () => {
    for (const sev of Severity.options) {
      const entry = SEVERITY_LANGUAGE_EN[sev];
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
      // English wording must NOT equal the Korean one (sanity check that
      // we actually translated rather than copy-pasted).
      expect(entry.label).not.toBe(SEVERITY_LANGUAGE_KO[sev].label);
    }
  });
});

describe('getSeverityLanguage', () => {
  it('returns Korean map for ko-KR', () => {
    expect(getSeverityLanguage('ko-KR')).toBe(SEVERITY_LANGUAGE_KO);
  });

  it('returns Korean map for bare "ko"', () => {
    expect(getSeverityLanguage('ko')).toBe(SEVERITY_LANGUAGE_KO);
  });

  it('returns Korean map for ko-KP (any ko-* variant)', () => {
    expect(getSeverityLanguage('ko-KP')).toBe(SEVERITY_LANGUAGE_KO);
  });

  it('is case-insensitive for the language subtag', () => {
    expect(getSeverityLanguage('KO-kr')).toBe(SEVERITY_LANGUAGE_KO);
  });

  it('returns English map for en-US', () => {
    expect(getSeverityLanguage('en-US')).toBe(SEVERITY_LANGUAGE_EN);
  });

  it('returns English map (default fallback) for unknown locales', () => {
    expect(getSeverityLanguage('ja-JP')).toBe(SEVERITY_LANGUAGE_EN);
    expect(getSeverityLanguage('fr')).toBe(SEVERITY_LANGUAGE_EN);
    expect(getSeverityLanguage('')).toBe(SEVERITY_LANGUAGE_EN);
  });

  it('defaults to Korean when no locale is supplied (ko-KR is the project default)', () => {
    expect(getSeverityLanguage()).toBe(SEVERITY_LANGUAGE_KO);
  });

  it('resolves P0 label per locale', () => {
    expect(getSeverityLanguage('ko-KR').P0.label).toBe('출시 차단');
    expect(getSeverityLanguage('en-US').P0.label).toBe('Launch Blocker');
  });
});
