// T2.8 / UPG-06 — ANALYZE_BUSINESS_READINESS step (No-LLM detection).
//
// Walks the clone for Pricing / Legal / Onboarding / Support / Analytics
// signals and writes the 5 boolean evidence keys into
// `state.businessEvidence`. step11 (`buildBusinessReadinessFindings`) converts
// FAIL keys into pending P1 findings before persistence.
//
// Phase 2: all 5 detectors run real filesystem checks. Detection strategy
// matches the W1-A precedent — look for canonical filenames in Next.js
// app/pages directories first, then fall back to README route hints. This
// is intentionally conservative (favors false negatives over false positives)
// because each FAIL emits a P1 finding the user will see prominently.
//
// No LLM, no network. Pure filesystem + regex.

import fsp from 'node:fs/promises';
import path from 'node:path';
import { EMPTY_BUSINESS_EVIDENCE, type BusinessEvidence } from '@cleartoship/audit-core';
import type { Step } from './index.js';
import { recordStepOutcome } from '../lib/record-step-outcome.js';

const LEGAL_FILE_CANDIDATES: ReadonlyArray<string> = [
  'privacy-policy.md',
  'PRIVACY.md',
  'privacy.md',
  'PRIVACY-POLICY.md',
  'terms.md',
  'TERMS.md',
  'TERMS-OF-SERVICE.md',
  'terms-of-service.md',
  'TOS.md',
  'docs/privacy-policy.md',
  'docs/terms.md',
  'docs/PRIVACY.md',
  'docs/TERMS.md',
  'public/privacy-policy.html',
  'public/terms.html',
];

const LEGAL_ROUTE_HINTS: ReadonlyArray<string> = [
  '/privacy',
  '/privacy-policy',
  '/terms',
  '/terms-of-service',
  '/tos',
];

const ANALYTICS_PATTERNS: ReadonlyArray<RegExp> = [
  // Google Analytics / gtag.
  /googletagmanager\.com\/gtag\/js/i,
  /\bgtag\s*\(\s*['"]config['"]/i,
  /www\.google-analytics\.com\/analytics\.js/i,
  // Plausible.
  /plausible\.io\/js\/(?:plausible|script)/i,
  // PostHog.
  /\bposthog\.init\s*\(/i,
  /app\.posthog\.com\/static\/array\.js/i,
  // Mixpanel.
  /cdn\.mxpnl\.com\/libs\/mixpanel/i,
  // Amplitude.
  /cdn\.amplitude\.com\/libs\/amplitude/i,
  // Segment.
  /cdn\.segment\.com\/analytics\.js/i,
];

const ANALYTICS_FILE_CANDIDATES: ReadonlyArray<string> = [
  'pages/_document.tsx',
  'pages/_document.jsx',
  'pages/_document.js',
  'pages/_app.tsx',
  'pages/_app.jsx',
  'pages/_app.js',
  'app/layout.tsx',
  'app/layout.jsx',
  'app/layout.js',
  'src/app/layout.tsx',
  'src/app/layout.jsx',
  'src/pages/_document.tsx',
  'src/pages/_app.tsx',
  'index.html',
  'public/index.html',
];

// Route segment names that, when matched as a directory under app/ or pages/,
// indicate a corresponding page is present. We probe both Next.js conventions
// (app/<segment>/page.tsx | pages/<segment>.tsx | pages/<segment>/index.tsx)
// plus the static SPA equivalent (public/<segment>.html).
const PRICING_ROUTE_SEGMENTS: ReadonlyArray<string> = ['pricing', 'plans', 'billing'];
const ONBOARDING_ROUTE_SEGMENTS: ReadonlyArray<string> = [
  'signup',
  'sign-up',
  'register',
  'onboarding',
  'get-started',
];
const SUPPORT_ROUTE_SEGMENTS: ReadonlyArray<string> = ['contact', 'support', 'help'];

const PRICING_README_HINTS: ReadonlyArray<string> = ['/pricing', '/plans', '/billing'];
const ONBOARDING_README_HINTS: ReadonlyArray<string> = [
  '/signup',
  '/sign-up',
  '/register',
  '/onboarding',
  '/get-started',
];
const SUPPORT_README_HINTS: ReadonlyArray<string> = ['/contact', '/support', '/help'];

// Mailto detection scans a small fixed set of UI shell files for an explicit
// support email anchor. Cheaper than recursing into every TSX file and avoids
// false positives from boilerplate email-template strings deep in the repo.
const MAILTO_FILE_CANDIDATES: ReadonlyArray<string> = [
  'app/layout.tsx',
  'app/layout.jsx',
  'src/app/layout.tsx',
  'pages/_app.tsx',
  'pages/_app.jsx',
  'pages/_document.tsx',
  'src/pages/_app.tsx',
  'src/pages/_document.tsx',
  'components/Footer.tsx',
  'components/footer.tsx',
  'src/components/Footer.tsx',
  'src/components/footer.tsx',
  'app/contact/page.tsx',
  'app/support/page.tsx',
  'pages/contact.tsx',
  'pages/support.tsx',
  'index.html',
  'public/index.html',
  'README.md',
];
const MAILTO_REGEX = /\bmailto:\s*[\w.+-]+@[\w-]+\.[\w.-]+/i;

async function safeRead(absPath: string): Promise<string | null> {
  try {
    return await fsp.readFile(absPath, 'utf8');
  } catch {
    return null;
  }
}

async function safeStat(absPath: string): Promise<boolean> {
  try {
    await fsp.stat(absPath);
    return true;
  } catch {
    return false;
  }
}

async function detectLegalDocs(clonePath: string): Promise<boolean> {
  for (const rel of LEGAL_FILE_CANDIDATES) {
    if (await safeStat(path.join(clonePath, rel))) return true;
  }
  // Fallback: scan README/footer-y candidates for the route hints.
  const readmeCandidates = ['README.md', 'README.txt', 'README', 'docs/README.md'];
  for (const rel of readmeCandidates) {
    const text = await safeRead(path.join(clonePath, rel));
    if (!text) continue;
    const lower = text.toLowerCase();
    for (const hint of LEGAL_ROUTE_HINTS) {
      if (lower.includes(hint)) return true;
    }
  }
  return false;
}

async function detectAnalytics(clonePath: string): Promise<boolean> {
  for (const rel of ANALYTICS_FILE_CANDIDATES) {
    const text = await safeRead(path.join(clonePath, rel));
    if (!text) continue;
    for (const re of ANALYTICS_PATTERNS) {
      if (re.test(text)) return true;
    }
  }
  return false;
}

// Probe the canonical Next.js and SPA locations for a given route segment.
// Treats either a directory (app router) or a leaf file (pages router /
// static HTML) as a positive signal that the route exists.
async function routeSegmentExists(clonePath: string, segment: string): Promise<boolean> {
  const candidates = [
    path.join('app', segment, 'page.tsx'),
    path.join('app', segment, 'page.jsx'),
    path.join('app', segment, 'page.js'),
    path.join('src', 'app', segment, 'page.tsx'),
    path.join('src', 'app', segment, 'page.jsx'),
    path.join('pages', `${segment}.tsx`),
    path.join('pages', `${segment}.jsx`),
    path.join('pages', `${segment}.js`),
    path.join('pages', segment, 'index.tsx'),
    path.join('pages', segment, 'index.jsx'),
    path.join('src', 'pages', `${segment}.tsx`),
    path.join('src', 'pages', `${segment}.jsx`),
    path.join('public', `${segment}.html`),
    path.join('public', segment, 'index.html'),
  ];
  for (const rel of candidates) {
    if (await safeStat(path.join(clonePath, rel))) return true;
  }
  return false;
}

async function readmeContains(clonePath: string, hints: ReadonlyArray<string>): Promise<boolean> {
  const readmeCandidates = ['README.md', 'README.txt', 'README', 'docs/README.md'];
  for (const rel of readmeCandidates) {
    const text = await safeRead(path.join(clonePath, rel));
    if (!text) continue;
    const lower = text.toLowerCase();
    for (const hint of hints) {
      if (lower.includes(hint)) return true;
    }
  }
  return false;
}

async function detectPricing(clonePath: string): Promise<boolean> {
  for (const seg of PRICING_ROUTE_SEGMENTS) {
    if (await routeSegmentExists(clonePath, seg)) return true;
  }
  return readmeContains(clonePath, PRICING_README_HINTS);
}

async function detectOnboarding(clonePath: string): Promise<boolean> {
  for (const seg of ONBOARDING_ROUTE_SEGMENTS) {
    if (await routeSegmentExists(clonePath, seg)) return true;
  }
  return readmeContains(clonePath, ONBOARDING_README_HINTS);
}

async function detectSupport(clonePath: string): Promise<boolean> {
  // Route-based signal first.
  for (const seg of SUPPORT_ROUTE_SEGMENTS) {
    if (await routeSegmentExists(clonePath, seg)) return true;
  }
  // README route hints.
  if (await readmeContains(clonePath, SUPPORT_README_HINTS)) return true;
  // mailto: in a small set of UI shell files / docs.
  for (const rel of MAILTO_FILE_CANDIDATES) {
    const text = await safeRead(path.join(clonePath, rel));
    if (!text) continue;
    if (MAILTO_REGEX.test(text)) return true;
  }
  return false;
}

export async function collectBusinessEvidence(clonePath: string): Promise<BusinessEvidence> {
  const [pricing, legal, onboarding, support, analytics] = await Promise.all([
    detectPricing(clonePath),
    detectLegalDocs(clonePath),
    detectOnboarding(clonePath),
    detectSupport(clonePath),
    detectAnalytics(clonePath),
  ]);
  return {
    ...EMPTY_BUSINESS_EVIDENCE,
    PRICING_PAGE_PRESENT: pricing,
    LEGAL_DOCS_PRESENT: legal,
    ONBOARDING_FLOW_PRESENT: onboarding,
    SUPPORT_CHANNEL_PRESENT: support,
    ANALYTICS_INSTALLED: analytics,
  };
}

export const step13bAnalyzeBusinessReadiness: Step = {
  step: 'ANALYZE_BUSINESS_READINESS',
  async execute(ctx, state) {
    if (!ctx.clonePath) {
      ctx.log('warn', 'Business readiness analysis: no clone path; skipping', {});
      return;
    }
    state.businessEvidence = await collectBusinessEvidence(ctx.clonePath);
    recordStepOutcome(state, 'ANALYZE_BUSINESS_READINESS', 'CHECKPOINT');
    ctx.log('info', 'Business readiness analysis complete', {
      pricing: state.businessEvidence.PRICING_PAGE_PRESENT,
      legal: state.businessEvidence.LEGAL_DOCS_PRESENT,
      onboarding: state.businessEvidence.ONBOARDING_FLOW_PRESENT,
      support: state.businessEvidence.SUPPORT_CHANNEL_PRESENT,
      analytics: state.businessEvidence.ANALYTICS_INSTALLED,
    });
  },
};
