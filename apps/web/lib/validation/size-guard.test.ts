// Size-guard tests live with the apps/web bundle for now (Phase 5 IMPROVE).
// Source of truth moved to packages/shared-types/src/size-guard.ts.
// Sprint 1+: relocate the test next to the source once shared-types adopts vitest.
import { describe, expect, it } from 'vitest';
import {
  FIRESTORE_DOC_MAX_BYTES,
  FIRESTORE_DOC_SAFE_BYTES,
  measureByteSize,
  truncateMarkdown,
  validateDocumentSize,
} from '@cleartoship/shared-types';

describe('size constants', () => {
  it('FIRESTORE_DOC_MAX_BYTES is 1 MiB', () => {
    expect(FIRESTORE_DOC_MAX_BYTES).toBe(1_048_576);
  });

  it('FIRESTORE_DOC_SAFE_BYTES leaves ~148KB margin', () => {
    expect(FIRESTORE_DOC_SAFE_BYTES).toBe(900_000);
    expect(FIRESTORE_DOC_MAX_BYTES - FIRESTORE_DOC_SAFE_BYTES).toBeGreaterThan(100_000);
  });
});

describe('measureByteSize — strings', () => {
  it('returns 0 for empty string', () => {
    expect(measureByteSize('')).toBe(0);
  });

  it('returns 1 byte per ASCII character', () => {
    expect(measureByteSize('hello')).toBe(5);
  });

  it('measures Korean (3 bytes per Hangul codepoint in UTF-8)', () => {
    // '안' is 3 bytes (U+C548) in UTF-8
    expect(measureByteSize('안')).toBe(3);
    expect(measureByteSize('안녕')).toBe(6);
  });

  it('measures emoji (4 bytes per non-BMP codepoint in UTF-8)', () => {
    // '😀' (U+1F600) is 4 bytes in UTF-8
    expect(measureByteSize('😀')).toBe(4);
  });

  it('measures mixed ASCII + Hangul + emoji', () => {
    // 'a' (1) + '안' (3) + '😀' (4) = 8
    expect(measureByteSize('a안😀')).toBe(8);
  });
});

describe('measureByteSize — non-string payloads', () => {
  it('returns the JSON-serialized byte length of an object', () => {
    const obj = { a: 1, b: 'hi' };
    // JSON.stringify => '{"a":1,"b":"hi"}' = 16 bytes
    expect(measureByteSize(obj)).toBe(16);
  });

  it('serializes Korean values inside an object correctly', () => {
    const obj = { msg: '안' };
    // '{"msg":"안"}' => 10 ASCII chars (1 byte each) + 1 Hangul (3 bytes) = 13 bytes
    expect(measureByteSize(obj)).toBe(13);
  });

  it('returns 0 for undefined (JSON.stringify returns undefined)', () => {
    expect(measureByteSize(undefined)).toBe(0);
  });

  it('measures arrays', () => {
    expect(measureByteSize([1, 2, 3])).toBe(Buffer.byteLength('[1,2,3]', 'utf8'));
  });
});

describe('validateDocumentSize', () => {
  it('returns ok:true for small payloads under default limit', () => {
    const r = validateDocumentSize({ tiny: 'value' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.size).toBeGreaterThan(0);
  });

  it('returns ok:false when payload exceeds maxBytes', () => {
    const huge = 'x'.repeat(901_000);
    const r = validateDocumentSize(huge);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.size).toBe(901_000);
      expect(r.max).toBe(FIRESTORE_DOC_SAFE_BYTES);
    }
  });

  it('honors a custom maxBytes override', () => {
    const r = validateDocumentSize('x'.repeat(150), 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.max).toBe(100);
  });

  it('boundary: payload exactly equal to maxBytes is ok:true', () => {
    const r = validateDocumentSize('x'.repeat(100), 100);
    expect(r.ok).toBe(true);
  });

  it('boundary: payload one byte over maxBytes is ok:false', () => {
    const r = validateDocumentSize('x'.repeat(101), 100);
    expect(r.ok).toBe(false);
  });
});

describe('truncateMarkdown', () => {
  it('returns original markdown when under maxBytes', () => {
    const md = '# small doc';
    expect(truncateMarkdown(md, 1000)).toBe(md);
  });

  it('appends Korean truncation marker when over budget', () => {
    const md = 'x'.repeat(2000);
    const truncated = truncateMarkdown(md, 500);
    expect(truncated).toMatch(/잘림: Firestore 1MB 한도 초과로 일부 내용 생략됨/);
  });

  it('result byte length is <= maxBytes after truncation', () => {
    const md = 'x'.repeat(2000);
    const truncated = truncateMarkdown(md, 500);
    expect(Buffer.byteLength(truncated, 'utf8')).toBeLessThanOrEqual(500);
  });

  it('does not split a Korean (3-byte UTF-8) character at the boundary', () => {
    // 1000 '안' chars = 3000 bytes. budget below boundary forces cut mid-char if naive.
    const md = '안'.repeat(1000);
    const marker = '\n\n... [잘림: Firestore 1MB 한도 초과로 일부 내용 생략됨]';
    const markerBytes = Buffer.byteLength(marker, 'utf8');
    const maxBytes = 500;
    const truncated = truncateMarkdown(md, maxBytes);
    // The truncated string before marker should consist only of full '안' chars.
    const beforeMarker = truncated.replace(marker, '');
    // Every code unit in beforeMarker must be '안'
    for (const ch of beforeMarker) {
      expect(ch).toBe('안');
    }
    // Total bytes within budget
    expect(Buffer.byteLength(truncated, 'utf8')).toBeLessThanOrEqual(maxBytes);
    // And the body bytes should be a clean multiple of 3 (no partial UTF-8 sequence).
    expect(Buffer.byteLength(beforeMarker, 'utf8') % 3).toBe(0);
    // Sanity: budget - markerBytes was the cap
    expect(Buffer.byteLength(beforeMarker, 'utf8')).toBeLessThanOrEqual(maxBytes - markerBytes);
  });

  it('does not split a 4-byte emoji at the boundary', () => {
    const md = '😀'.repeat(500); // 2000 bytes
    const truncated = truncateMarkdown(md, 300);
    const marker = '\n\n... [잘림: Firestore 1MB 한도 초과로 일부 내용 생략됨]';
    const beforeMarker = truncated.replace(marker, '');
    // Body bytes should be multiple of 4
    expect(Buffer.byteLength(beforeMarker, 'utf8') % 4).toBe(0);
    // Every codepoint should still be '😀'
    for (const ch of [...beforeMarker]) {
      expect(ch).toBe('😀');
    }
  });

  it('marker byte detection: 0xc0 mask handles continuation byte correctly', () => {
    // Continuation bytes in UTF-8 start with 10xxxxxx => (byte & 0xc0) === 0x80
    // Construct a payload large enough that maxBytes > markerBytes AND the
    // forced budget lands inside a multi-byte sequence.
    // 100 '안' = 300 bytes. marker ~67 bytes. maxBytes = markerBytes + 5 = ~72.
    // currentBytes (300) > maxBytes (72), so truncation engages. budget = 5,
    // which slices into the middle of the first '안' (bytes ec 95 88 ec ...).
    const md = '안'.repeat(100);
    const marker = '\n\n... [잘림: Firestore 1MB 한도 초과로 일부 내용 생략됨]';
    const markerBytes = Buffer.byteLength(marker, 'utf8');
    const maxBytes = markerBytes + 5; // budget=5 -> cut slides into mid '안'
    const truncated = truncateMarkdown(md, maxBytes);
    const beforeMarker = truncated.replace(marker, '');
    // Body bytes must be a multiple of 3 (clean '안' boundary) and < 5
    const bodyBytes = Buffer.byteLength(beforeMarker, 'utf8');
    expect(bodyBytes % 3).toBe(0);
    expect(bodyBytes).toBeLessThanOrEqual(5);
    // Every codepoint left must be a full '안'.
    for (const ch of beforeMarker) expect(ch).toBe('안');
  });

  it('handles exactly-at-boundary input (no truncation)', () => {
    const md = 'x'.repeat(100);
    expect(truncateMarkdown(md, 100)).toBe(md);
  });

  it('handles maxBytes smaller than marker (budget clamped to 0)', () => {
    const md = 'x'.repeat(100);
    const result = truncateMarkdown(md, 1);
    // Marker is appended even if body becomes empty
    expect(result).toContain('잘림');
  });
});
