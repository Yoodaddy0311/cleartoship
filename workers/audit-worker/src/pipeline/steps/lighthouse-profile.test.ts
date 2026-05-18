// Unit tests for the lighthouse profile resolver. Profile shapes are read by
// the lighthouse step's `settings` block, so the keys here must match what
// Lighthouse actually expects — guard them explicitly.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIGHTHOUSE_PROFILE,
  isLighthouseProfileId,
  resolveLighthouseProfile,
  toLighthouseSettings,
} from './lighthouse-profile.js';

describe('isLighthouseProfileId', () => {
  it('accepts each documented profile id', () => {
    expect(isLighthouseProfileId('mobile-slow4G')).toBe(true);
    expect(isLighthouseProfileId('mobile-fast4G')).toBe(true);
    expect(isLighthouseProfileId('desktop-cable')).toBe(true);
    expect(isLighthouseProfileId('desktop-no-throttle')).toBe(true);
  });

  it('rejects unknown values', () => {
    expect(isLighthouseProfileId('mobile')).toBe(false);
    expect(isLighthouseProfileId('')).toBe(false);
    expect(isLighthouseProfileId('MOBILE-SLOW4G')).toBe(false);
  });
});

describe('resolveLighthouseProfile', () => {
  it('returns the default profile when env is undefined', () => {
    const { profile, fallback } = resolveLighthouseProfile(undefined);
    expect(profile.id).toBe(DEFAULT_LIGHTHOUSE_PROFILE);
    expect(fallback).toBe(false);
  });

  it('returns the default profile when env is empty string', () => {
    const { profile, fallback } = resolveLighthouseProfile('');
    expect(profile.id).toBe(DEFAULT_LIGHTHOUSE_PROFILE);
    expect(fallback).toBe(false);
  });

  it('returns the requested profile when env matches a known id', () => {
    const { profile, fallback } = resolveLighthouseProfile('desktop-cable');
    expect(profile.id).toBe('desktop-cable');
    expect(profile.formFactor).toBe('desktop');
    expect(fallback).toBe(false);
  });

  it('falls back to default and flags fallback=true for unknown values', () => {
    const { profile, fallback } = resolveLighthouseProfile('mobile-3G');
    expect(profile.id).toBe(DEFAULT_LIGHTHOUSE_PROFILE);
    expect(fallback).toBe(true);
  });

  it('default profile is mobile + slow 4G (cpuSlowdown=4)', () => {
    const { profile } = resolveLighthouseProfile(undefined);
    expect(profile.formFactor).toBe('mobile');
    expect(profile.screenEmulation).toMatchObject({
      mobile: true,
      width: 375,
      height: 667,
    });
    expect(profile.throttling.cpuSlowdownMultiplier).toBe(4);
  });

  it('desktop-no-throttle profile has zero throughput throttling', () => {
    const { profile } = resolveLighthouseProfile('desktop-no-throttle');
    expect(profile.throttling.cpuSlowdownMultiplier).toBe(1);
    expect(profile.throttling.throughputKbps).toBe(0);
    expect(profile.screenEmulation.mobile).toBe(false);
  });
});

describe('toLighthouseSettings', () => {
  it('exposes only formFactor, screenEmulation, throttling — no profile metadata', () => {
    const { profile } = resolveLighthouseProfile('mobile-slow4G');
    const settings = toLighthouseSettings(profile);
    expect(Object.keys(settings).sort()).toEqual(
      ['formFactor', 'screenEmulation', 'throttling'].sort(),
    );
  });

  it('passes mobile viewport 375x667 for default profile', () => {
    const { profile } = resolveLighthouseProfile('mobile-slow4G');
    const settings = toLighthouseSettings(profile);
    expect(settings.screenEmulation.width).toBe(375);
    expect(settings.screenEmulation.height).toBe(667);
    expect(settings.formFactor).toBe('mobile');
  });
});
