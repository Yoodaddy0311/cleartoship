import { describe, expect, it } from 'vitest';
import {
  W1B_CHECKLIST,
  W1B_FINE_PATTERNS,
  W1B_GROUP_TAG,
  W1B_TAG_PREFIX_REGEX,
  W1B_TOTAL_IDS,
  getW1BFinePattern,
  getW1BId,
  getW1BIdByName,
  getW1BItem,
  isW1BId,
} from './w1b-checklist.js';
import type { RiskCategory } from './risky-functions.js';

describe('W1-B checklist mapping', () => {
  it('exposes the group tag W1-B', () => {
    expect(W1B_GROUP_TAG).toBe('W1-B');
  });

  it('covers every RiskCategory with a unique W1-B sub-ID', () => {
    const cats: RiskCategory[] = [
      'auth',
      'payment',
      'delete',
      'pii',
      'auth-boundary',
      'data-mutation',
    ];
    const ids = new Set<string>();
    for (const c of cats) {
      const id = getW1BId(c);
      expect(id).toMatch(W1B_TAG_PREFIX_REGEX);
      ids.add(id);
    }
    expect(ids.size).toBe(cats.length);
  });

  it('returns the same ID for the same category (stable mapping)', () => {
    expect(getW1BId('auth')).toBe(getW1BId('auth'));
    expect(getW1BId('payment')).toBe('W1-B2');
    expect(getW1BId('delete')).toBe('W1-B3');
  });

  it('getW1BItem returns metadata including label and description', () => {
    const item = getW1BItem('W1-B1');
    expect(item).toBeDefined();
    expect(item!.category).toBe('auth');
    expect(item!.label.length).toBeGreaterThan(0);
    expect(item!.description.length).toBeGreaterThan(0);
  });

  it('getW1BItem returns undefined for unknown IDs', () => {
    expect(getW1BItem('W1-B999')).toBeUndefined();
    expect(getW1BItem('W2-A1')).toBeUndefined();
  });

  it('isW1BId distinguishes W1-B tags from other tags', () => {
    expect(isW1BId('W1-B1')).toBe(true);
    expect(isW1BId('W1-B6')).toBe(true);
    expect(isW1BId('W1-B')).toBe(false);
    expect(isW1BId('risky-function')).toBe(false);
    expect(isW1BId('auth')).toBe(false);
    expect(isW1BId('W1-A1')).toBe(false);
  });

  it('W1B_CHECKLIST is non-empty and IDs are sequential W1-B1..W1-Bn', () => {
    expect(W1B_CHECKLIST.length).toBeGreaterThanOrEqual(6);
    W1B_CHECKLIST.forEach((item, idx) => {
      expect(item.id).toBe(`W1-B${idx + 1}`);
    });
  });
});

describe('W1-B fine-grained pattern grid (T1.3-FU)', () => {
  it('total addressable IDs is 80+ (baseline + fine)', () => {
    expect(W1B_TOTAL_IDS).toBeGreaterThanOrEqual(80);
    expect(W1B_TOTAL_IDS).toBe(W1B_CHECKLIST.length + W1B_FINE_PATTERNS.length);
  });

  it('fine pattern IDs are sequential and start at W1-B7', () => {
    const offset = W1B_CHECKLIST.length;
    W1B_FINE_PATTERNS.forEach((p, idx) => {
      expect(p.id).toBe(`W1-B${offset + idx + 1}`);
    });
    expect(W1B_FINE_PATTERNS[0]?.id).toBe('W1-B7');
  });

  it('fine pattern IDs are unique and disjoint from baseline IDs', () => {
    const ids = new Set<string>();
    for (const item of W1B_CHECKLIST) ids.add(item.id);
    const before = ids.size;
    for (const p of W1B_FINE_PATTERNS) ids.add(p.id);
    expect(ids.size).toBe(before + W1B_FINE_PATTERNS.length);
  });

  it('every fine pattern references a known RiskCategory', () => {
    const known: ReadonlySet<RiskCategory> = new Set<RiskCategory>([
      'auth', 'payment', 'delete', 'pii', 'auth-boundary', 'data-mutation',
    ]);
    for (const p of W1B_FINE_PATTERNS) {
      expect(known.has(p.category)).toBe(true);
    }
  });

  it('every category has at least one fine pattern (grid coverage)', () => {
    const cats: RiskCategory[] = [
      'auth', 'payment', 'delete', 'pii', 'auth-boundary', 'data-mutation',
    ];
    for (const c of cats) {
      const hits = W1B_FINE_PATTERNS.filter((p) => p.category === c);
      expect(hits.length, `category ${c} must have >=1 fine pattern`).toBeGreaterThan(0);
    }
  });

  it('getW1BIdByName picks fine ID when function name matches a pattern', () => {
    const loginId = getW1BIdByName('auth', 'loginWithEmail');
    expect(loginId).not.toBe('W1-B1');
    expect(loginId).toMatch(W1B_TAG_PREFIX_REGEX);
    const meta = getW1BFinePattern(loginId);
    expect(meta?.patternKey).toBe('login');
    expect(meta?.category).toBe('auth');
  });

  it('getW1BIdByName picks distinct IDs for distinct patterns in same category', () => {
    const loginId = getW1BIdByName('auth', 'loginUser');
    const jwtId = getW1BIdByName('auth', 'parseJwtPayload');
    expect(loginId).not.toBe(jwtId);
  });

  it('getW1BIdByName falls back to category baseline when no pattern matches', () => {
    expect(getW1BIdByName('auth', 'totallyUnrelatedName')).toBe('W1-B1');
    expect(getW1BIdByName('payment', 'someRandomThing')).toBe('W1-B2');
    expect(getW1BIdByName('delete', 'just_a_name')).toBe('W1-B3');
  });

  it('getW1BIdByName respects category isolation (payment name does not match auth grid)', () => {
    // "charge" only exists under `payment`, not `auth`. Calling with category=auth
    // must NOT return the payment.charge ID; it must fall back to the auth baseline.
    expect(getW1BIdByName('auth', 'chargeCustomer')).toBe('W1-B1');
    expect(getW1BIdByName('payment', 'chargeCustomer')).not.toBe('W1-B2');
  });

  it('getW1BItem resolves fine IDs to metadata as well as baseline IDs', () => {
    const fineId = W1B_FINE_PATTERNS[0]!.id;
    const item = getW1BItem(fineId);
    expect(item).toBeDefined();
    expect(item!.id).toBe(fineId);
    expect(item!.label.length).toBeGreaterThan(0);
  });

  it('isW1BId accepts fine IDs beyond W1-B9 (multi-digit)', () => {
    expect(isW1BId('W1-B10')).toBe(true);
    expect(isW1BId('W1-B83')).toBe(true);
    expect(isW1BId('W1-B100')).toBe(true);
  });

  it('every fine pattern has non-empty label and description', () => {
    for (const p of W1B_FINE_PATTERNS) {
      expect(p.label.length, `${p.id} label`).toBeGreaterThan(0);
      expect(p.description.length, `${p.id} description`).toBeGreaterThan(0);
    }
  });

  it('every fine pattern key is unique within its category', () => {
    const seen = new Set<string>();
    for (const p of W1B_FINE_PATTERNS) {
      const key = `${p.category}:${p.patternKey}`;
      expect(seen.has(key), `duplicate ${key}`).toBe(false);
      seen.add(key);
    }
  });
});
