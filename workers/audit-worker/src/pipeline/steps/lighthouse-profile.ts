// Lighthouse throttling profile resolution.
//
// Background: T1.7 — different audits target different devices/networks. A
// single hard-coded "desktop / no throttling" config under-reports the LCP
// users actually experience. Operators select a profile per environment via
// `LIGHTHOUSE_PROFILE`. Unknown values fall back to the default rather than
// failing the pipeline.

export type LighthouseProfileId =
  | 'mobile-slow4G'
  | 'mobile-fast4G'
  | 'desktop-cable'
  | 'desktop-no-throttle';

export const DEFAULT_LIGHTHOUSE_PROFILE: LighthouseProfileId = 'mobile-slow4G';

interface ScreenEmulation {
  mobile: boolean;
  width: number;
  height: number;
  deviceScaleFactor: number;
  disabled: boolean;
}

interface Throttling {
  rttMs: number;
  throughputKbps: number;
  cpuSlowdownMultiplier: number;
  requestLatencyMs: number;
  downloadThroughputKbps: number;
  uploadThroughputKbps: number;
}

export interface LighthouseProfile {
  id: LighthouseProfileId;
  formFactor: 'mobile' | 'desktop';
  screenEmulation: ScreenEmulation;
  throttling: Throttling;
}

const MOBILE_SCREEN: ScreenEmulation = {
  mobile: true,
  width: 375,
  height: 667,
  deviceScaleFactor: 2,
  disabled: false,
};

const DESKTOP_SCREEN: ScreenEmulation = {
  mobile: false,
  width: 1350,
  height: 940,
  deviceScaleFactor: 1,
  disabled: false,
};

// Throttling presets mirror Lighthouse's published constants so reports stay
// comparable with web.dev's PSI runs.
const SLOW_4G: Throttling = {
  rttMs: 150,
  throughputKbps: 1_638.4,
  cpuSlowdownMultiplier: 4,
  requestLatencyMs: 562.5,
  downloadThroughputKbps: 1_474.56,
  uploadThroughputKbps: 675,
};

const FAST_4G: Throttling = {
  rttMs: 40,
  throughputKbps: 10_240,
  cpuSlowdownMultiplier: 2,
  requestLatencyMs: 150,
  downloadThroughputKbps: 9_216,
  uploadThroughputKbps: 3_072,
};

const CABLE: Throttling = {
  rttMs: 28,
  throughputKbps: 5_120,
  cpuSlowdownMultiplier: 1,
  requestLatencyMs: 105,
  downloadThroughputKbps: 4_608,
  uploadThroughputKbps: 1_536,
};

const NO_THROTTLE: Throttling = {
  rttMs: 0,
  throughputKbps: 0,
  cpuSlowdownMultiplier: 1,
  requestLatencyMs: 0,
  downloadThroughputKbps: 0,
  uploadThroughputKbps: 0,
};

const PROFILES: Readonly<Record<LighthouseProfileId, LighthouseProfile>> = {
  'mobile-slow4G': {
    id: 'mobile-slow4G',
    formFactor: 'mobile',
    screenEmulation: MOBILE_SCREEN,
    throttling: SLOW_4G,
  },
  'mobile-fast4G': {
    id: 'mobile-fast4G',
    formFactor: 'mobile',
    screenEmulation: MOBILE_SCREEN,
    throttling: FAST_4G,
  },
  'desktop-cable': {
    id: 'desktop-cable',
    formFactor: 'desktop',
    screenEmulation: DESKTOP_SCREEN,
    throttling: CABLE,
  },
  'desktop-no-throttle': {
    id: 'desktop-no-throttle',
    formFactor: 'desktop',
    screenEmulation: DESKTOP_SCREEN,
    throttling: NO_THROTTLE,
  },
};

export function isLighthouseProfileId(value: string): value is LighthouseProfileId {
  return Object.prototype.hasOwnProperty.call(PROFILES, value);
}

export function resolveLighthouseProfile(
  raw: string | undefined,
): { profile: LighthouseProfile; fallback: boolean } {
  if (!raw) return { profile: PROFILES[DEFAULT_LIGHTHOUSE_PROFILE], fallback: false };
  if (isLighthouseProfileId(raw)) return { profile: PROFILES[raw], fallback: false };
  return { profile: PROFILES[DEFAULT_LIGHTHOUSE_PROFILE], fallback: true };
}

// Shape mirrors Lighthouse's `settings` block; only the keys we need.
export function toLighthouseSettings(profile: LighthouseProfile): {
  formFactor: 'mobile' | 'desktop';
  screenEmulation: ScreenEmulation;
  throttling: Throttling;
} {
  return {
    formFactor: profile.formFactor,
    screenEmulation: profile.screenEmulation,
    throttling: profile.throttling,
  };
}
