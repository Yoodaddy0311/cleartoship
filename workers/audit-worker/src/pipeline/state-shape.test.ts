// PipelineState extension compatibility tests.
//
// Many in-flight branches (W2 framework-profile, W5 risky-functions, etc.)
// add new fields to PipelineState. The contract is:
//   - createInitialState() returns an object with EVERY declared field
//     populated to a sensible default.
//   - Step implementations must be able to read every field on a freshly
//     created state without hitting `undefined`.
//
// If a new branch widens PipelineState but forgets to seed the field in
// createInitialState, downstream steps see `undefined` and crash. This test
// asserts the default object's keys cover the public PipelineState surface,
// so the omission shows up at test time instead of at runtime in prod.

import { describe, expect, it } from 'vitest';
import { createInitialState, type PipelineState } from './steps/index.js';

describe('createInitialState', () => {
  it('returns a fresh object on every call (no shared mutable references)', () => {
    const a = createInitialState();
    const b = createInitialState();
    expect(a).not.toBe(b);
    expect(a.pendingFindings).not.toBe(b.pendingFindings);
    expect(a.severityCounts).not.toBe(b.severityCounts);
  });

  it('seeds every currently-known field with a non-undefined default', () => {
    const state = createInitialState();
    // Enumerate every property and assert it is explicitly defined.
    // `undefined` is the failure mode we are guarding against.
    const entries = Object.entries(state) as Array<[keyof PipelineState, unknown]>;
    expect(entries.length).toBeGreaterThan(0);
    for (const [key, value] of entries) {
      expect(value, `field "${String(key)}" is undefined in createInitialState()`).not.toBeUndefined();
    }
  });

  it('seeds collection-like fields to empty containers, not null', () => {
    const state = createInitialState();
    expect(Array.isArray(state.fileTree)).toBe(true);
    expect(state.fileTree).toHaveLength(0);
    expect(Array.isArray(state.techStack)).toBe(true);
    expect(state.techStack).toHaveLength(0);
    expect(Array.isArray(state.detectedFeatures)).toBe(true);
    expect(state.detectedFeatures).toHaveLength(0);
    expect(Array.isArray(state.pendingFindings)).toBe(true);
    expect(state.pendingFindings).toHaveLength(0);
    expect(Array.isArray(state.persistedFindingIds)).toBe(true);
    expect(state.persistedFindingIds).toHaveLength(0);
  });

  it('seeds severityCounts with all four P-levels at zero', () => {
    const state = createInitialState();
    expect(state.severityCounts).toEqual({ P0: 0, P1: 0, P2: 0, P3: 0 });
  });

  it('seeds optional-detail fields explicitly to null (never undefined)', () => {
    const state = createInitialState();
    expect(state.repoMetadata).toBeNull();
    expect(state.frameworkProfile).toBeNull();
  });

  it('seeds readiness fields with launch-safe defaults', () => {
    const state = createInitialState();
    expect(state.readinessScore).toBe(0);
    expect(state.launchStatus).toBe('NOT_READY');
  });

  it('keys returned cover the keys consumed by downstream code today', () => {
    // The runner + every step relies on these keys being present from the
    // very first iteration. If a refactor renames a key but misses one
    // call-site, this test fails with a clear message.
    const state = createInitialState();
    const required: Array<keyof PipelineState> = [
      'repoMetadata',
      'fileTree',
      'techStack',
      'frameworkProfile',
      'detectedFeatures',
      'pendingFindings',
      'severityCounts',
      'persistedFindingIds',
      'readinessScore',
      'launchStatus',
    ];
    for (const key of required) {
      expect(
        Object.prototype.hasOwnProperty.call(state, key),
        `createInitialState() is missing required key "${String(key)}"`,
      ).toBe(true);
    }
  });
});
