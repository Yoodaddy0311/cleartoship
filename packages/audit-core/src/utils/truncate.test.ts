// W3.CLN.2 — UTF-8 byte-safe truncation tests.
//
// Four named cases mandated by PRD §A.4.2:
//   1. UTF-8 byte boundary (CJK 3-byte char) — must not split mid-byte
//   2. Emoji (4-byte UTF-8 — surrogate pair in UTF-16)
//   3. null / undefined / empty input
//   4. maxBytes === 0
//
// Plus a small set of supporting cases (fast-path, suffix override, suffix
// larger than budget) to guard the contract:
//   "the returned string's UTF-8 byte length is always ≤ maxBytes".

import { describe, expect, it } from 'vitest';
import { truncate } from './truncate.js';

function byteLen(s: string): number {
  return new TextEncoder().encode(s).length;
}

describe('truncate (W3.CLN.2 — UTF-8 byte-safe)', () => {
  // ---- Case 1: UTF-8 byte boundary (CJK = 3 bytes per char) ----
  describe('UTF-8 byte boundary (CJK 3-byte chars)', () => {
    it('preserves whole Hangul syllables — never splits mid-byte', () => {
      // '한글테스트' = 5 Hangul × 3 bytes = 15 bytes. With suffix '…' (3
      // bytes), budget=10 allows 3 syllables (9 bytes) + '…' = 12 bytes.
      const result = truncate('한글테스트입니다요', 12);
      expect(byteLen(result)).toBeLessThanOrEqual(12);
      // Must NOT contain a replacement character or partial sequence.
      expect(result).not.toContain('�');
      expect(result.endsWith('…')).toBe(true);
    });

    it('returns input unchanged when already within byte budget (fast path)', () => {
      const s = '안녕'; // 6 bytes
      expect(truncate(s, 100)).toBe('안녕');
      expect(truncate(s, 6)).toBe('안녕'); // exact fit, no suffix
    });

    it('produces output ≤ maxBytes for every budget step across a CJK string', () => {
      const input = '회원가입로그인결제'; // 9 Hangul × 3 = 27 bytes
      for (let budget = 4; budget <= 30; budget++) {
        const out = truncate(input, budget);
        expect(byteLen(out)).toBeLessThanOrEqual(budget);
      }
    });
  });

  // ---- Case 2: Emoji (4-byte UTF-8 / surrogate pair in UTF-16) ----
  describe('emoji (4-byte UTF-8)', () => {
    it('treats 👍 (4-byte UTF-8) as atomic — never produces a dangling surrogate', () => {
      // '👍' = 4 bytes. Budget = 6 with default '…' (3 bytes) suffix = budget 3
      // → cannot fit even one 👍, so output is just the suffix.
      const result = truncate('👍👍👍', 6);
      expect(byteLen(result)).toBeLessThanOrEqual(6);
      // No replacement character (would indicate a corrupted UTF-8 sequence).
      expect(result).not.toContain('�');
      // Whichever 👍s survive must be COMPLETE codepoints (we check via
      // round-trip: encode→decode must equal the original).
      const roundTrip = new TextDecoder().decode(new TextEncoder().encode(result));
      expect(roundTrip).toBe(result);
    });

    it('fits a single 👍 when budget allows (4 bytes + 3-byte suffix = 7)', () => {
      const result = truncate('👍👍👍', 7);
      expect(byteLen(result)).toBeLessThanOrEqual(7);
      expect(result).toBe('👍…');
    });

    it('mixed CJK + emoji + ASCII stays valid UTF-8 after truncation', () => {
      const input = '결제 done 👍 next';
      const result = truncate(input, 12);
      expect(byteLen(result)).toBeLessThanOrEqual(12);
      // Round-trip check: result must be valid UTF-8.
      const roundTrip = new TextDecoder('utf-8', { fatal: true }).decode(
        new TextEncoder().encode(result),
      );
      expect(roundTrip).toBe(result);
    });
  });

  // ---- Case 3: null / undefined / empty input ----
  describe('null / undefined / empty input (defensive)', () => {
    it('returns empty string for null', () => {
      expect(truncate(null, 50)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(truncate(undefined, 50)).toBe('');
    });

    it('returns empty string for empty input', () => {
      expect(truncate('', 50)).toBe('');
    });
  });

  // ---- Case 4: maxBytes === 0 (and adjacent invariants) ----
  describe('maxBytes === 0 (and invalid budgets)', () => {
    it('returns empty string when maxBytes is 0', () => {
      expect(truncate('anything', 0)).toBe('');
    });

    it('returns empty string when maxBytes is negative', () => {
      expect(truncate('anything', -5)).toBe('');
    });

    it('returns empty string when maxBytes is NaN / Infinity-edge', () => {
      expect(truncate('anything', Number.NaN)).toBe('');
    });

    it('returns empty string when suffix alone exceeds maxBytes', () => {
      // '…' is 3 bytes UTF-8; budget=2 cannot fit it.
      expect(truncate('hello world', 2)).toBe('');
    });
  });

  // ---- Supporting: custom suffix ----
  describe('custom suffix', () => {
    it('respects the provided suffix and still honors the byte budget', () => {
      const result = truncate('hello world this is long', 10, '...');
      expect(byteLen(result)).toBeLessThanOrEqual(10);
      expect(result.endsWith('...')).toBe(true);
    });

    it('empty suffix is allowed (hard truncate, no ellipsis)', () => {
      const result = truncate('hello world', 5, '');
      expect(byteLen(result)).toBeLessThanOrEqual(5);
      expect(result).toBe('hello');
    });
  });
});
