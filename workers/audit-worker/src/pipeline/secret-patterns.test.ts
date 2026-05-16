// Verifies the security invariant: the raw secret value is NEVER returned
// from the scanning surface. Only `maskSecret()` output (`***<last4>`) is
// ever exposed to callers.
//
// NOTE: every fixture below is a SYNTHETIC string crafted at runtime so this
// test file itself contains no plausibly-real credentials.

import { describe, expect, it } from 'vitest';
import { maskSecret, scanText, looksBinary, SECRET_PATTERNS } from './secret-patterns.js';

// Build fixtures dynamically so this source file contains no static patterns
// that look like real credentials.
const SYNTH = {
  aws: 'A' + 'KIA' + 'A'.repeat(12) + 'WXYZ',
  openai: 's' + 'k-' + 'A'.repeat(40) + 'WXYZ',
  ghPat: 'ghp' + '_' + 'A'.repeat(32) + 'WXYZ',
  jwt: 'eyJ' + 'a'.repeat(20) + '.eyJ' + 'b'.repeat(20) + '.' + 'c'.repeat(16),
  pemHeader: '-----' + 'BEGIN ' + 'RSA PRIVATE KEY' + '-----',
};

describe('maskSecret', () => {
  it('replaces everything except the last 4 chars', () => {
    const out = maskSecret(SYNTH.aws);
    expect(out.endsWith(SYNTH.aws.slice(-4))).toBe(true);
    expect(out.includes(SYNTH.aws.slice(0, -4))).toBe(false);
  });

  it('returns *** for empty or 4-or-shorter input', () => {
    expect(maskSecret('')).toBe('***');
    expect(maskSecret('ab')).toBe('***');
    expect(maskSecret('abcd')).toBe('***');
  });

  it('does not leak the raw value', () => {
    const out = maskSecret(SYNTH.openai);
    expect(out.includes(SYNTH.openai.slice(0, -4))).toBe(false);
  });

  it('starts with the *** prefix', () => {
    expect(maskSecret(SYNTH.aws).startsWith('***')).toBe(true);
  });
});

describe('scanText', () => {
  it('detects AWS Access Key IDs', () => {
    const hits = scanText(`export AWS_KEY=${SYNTH.aws}`);
    expect(hits.length).toBeGreaterThan(0);
    const hit = hits.find((h) => h.patternId === 'aws-access-key-id')!;
    expect(hit).toBeDefined();
    expect(hit.maskedValue.includes(SYNTH.aws.slice(0, -4))).toBe(false);
    expect(hit.maskedValue.endsWith(SYNTH.aws.slice(-4))).toBe(true);
  });

  it('detects OpenAI keys without persisting the raw value', () => {
    const hits = scanText(`const KEY = "${SYNTH.openai}";`);
    const hit = hits.find((h) => h.patternId === 'openai-api-key');
    expect(hit).toBeDefined();
    expect(hit!.maskedValue.includes(SYNTH.openai)).toBe(false);
    expect(hit!.maskedValue.endsWith(SYNTH.openai.slice(-4))).toBe(true);
  });

  it('detects GitHub PAT', () => {
    const hits = scanText(`token = "${SYNTH.ghPat}"`);
    const hit = hits.find((h) => h.patternId === 'github-pat');
    expect(hit).toBeDefined();
    expect(hit!.maskedValue.includes(SYNTH.ghPat)).toBe(false);
  });

  it('detects JWTs', () => {
    const hits = scanText(`AUTH=${SYNTH.jwt}`);
    expect(hits.some((h) => h.patternId === 'jwt')).toBe(true);
  });

  it('detects PEM private key block markers', () => {
    const hits = scanText(`${SYNTH.pemHeader}\nbody\n-----END RSA PRIVATE KEY-----`);
    expect(hits.some((h) => h.patternId === 'private-key-block')).toBe(true);
  });

  it('returns no hits for benign content', () => {
    const hits = scanText('const helloWorld = "hi"; // nothing to see');
    expect(hits).toEqual([]);
  });

  it('reports correct line and column numbers (1-indexed)', () => {
    const text = `first line\nsecond line with ${SYNTH.aws} here`;
    const hits = scanText(text);
    const hit = hits.find((h) => h.patternId === 'aws-access-key-id')!;
    expect(hit.line).toBe(2);
    expect(hit.column).toBeGreaterThan(0);
  });

  it('mask output never equals the raw secret', () => {
    const hits = scanText(SYNTH.aws);
    expect(hits[0]!.maskedValue).not.toBe(SYNTH.aws);
  });
});

describe('looksBinary', () => {
  it('detects NUL byte as binary marker', () => {
    expect(looksBinary(Buffer.from([0x48, 0x00, 0x49]))).toBe(true);
  });

  it('treats pure ASCII as text', () => {
    expect(looksBinary(Buffer.from('const greeting = "hello world";'))).toBe(false);
  });
});

describe('SECRET_PATTERNS catalog invariants', () => {
  it('every pattern has a capture group #1 for the secret body', () => {
    for (const p of SECRET_PATTERNS) {
      const src = p.regex.source;
      expect(/\((?!\?:)/.test(src)).toBe(true);
    }
  });

  it('pattern ids are unique', () => {
    const ids = SECRET_PATTERNS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
