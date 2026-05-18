// Headless browser analysis of the deploy URL: Playwright captures screenshots
// + DOM stats, axe-core audits accessibility, Lighthouse measures performance.
// Every external dependency is loaded lazily so a missing install gracefully
// degrades instead of crashing the pipeline.

import type { Step } from './index.js';
import type { NormalizedFinding } from '../../adapters/index.js';
import { writeToolResult } from '../../firestore/writers.js';
import {
  resolveLighthouseProfile,
  toLighthouseSettings,
  type LighthouseProfile,
} from './lighthouse-profile.js';
import { recordStepOutcome } from '../lib/record-step-outcome.js';
import { recordLighthouseLatency } from '../../observability/metrics.js';

const NAV_TIMEOUT_MS = 30_000;
const LH_TIMEOUT_MS = 60_000;

interface PageStats {
  url: string;
  buttonCount: number;
  linkCount: number;
  formCount: number;
}

interface AxeResult {
  violations?: Array<{
    id?: string;
    impact?: string;
    description?: string;
    help?: string;
    helpUrl?: string;
    nodes?: Array<{ target?: string[]; html?: string }>;
  }>;
}

interface LighthouseResult {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
  lcpMs: number | null;
  clsScore: number | null;
  profileId: string;
}

function axeSeverity(impact: string | undefined): 'P0' | 'P1' | 'P2' | 'P3' {
  switch ((impact ?? '').toLowerCase()) {
    case 'critical':
      return 'P0';
    case 'serious':
      return 'P1';
    case 'moderate':
      return 'P2';
    default:
      return 'P3';
  }
}

function axeToFindings(deployUrl: string, raw: AxeResult): NormalizedFinding[] {
  const findings: NormalizedFinding[] = [];
  for (const v of raw.violations?.slice(0, 50) ?? []) {
    const ruleId = v.id ?? 'axe-unknown';
    const selector = v.nodes?.[0]?.target?.join(' ') ?? null;
    findings.push({
      title: `접근성: ${v.help ?? ruleId}`,
      category: 'UX_UI',
      severity: axeSeverity(v.impact),
      confidence: 'HIGH',
      summary: v.description ?? ruleId,
      nonDeveloperExplanation:
        '시각/청각/조작 보조 도구를 사용하는 사용자가 이 페이지를 사용하기 어려울 수 있습니다.',
      technicalExplanation: `axe-core rule ${ruleId} reported impact=${v.impact ?? 'unknown'}.`,
      impact: '접근성 위반은 사용자 손실과 법적 리스크(예: WCAG 미준수)로 이어질 수 있습니다.',
      recommendation: v.helpUrl
        ? `axe 가이드(${v.helpUrl})에 따라 수정하세요.`
        : '해당 규칙의 axe 문서를 참고해 수정하세요.',
      acceptanceCriteria: ['해당 axe 규칙이 더 이상 위반되지 않는다.'],
      tags: ['axe', 'accessibility'],
      evidences: [
        {
          type: 'AXE',
          source: 'axe-core',
          path: null,
          lineStart: null,
          lineEnd: null,
          url: deployUrl,
          selector,
          screenshotPath: null,
          snippet: v.nodes?.[0]?.html ?? null,
          maskedValue: null,
          metadata: { rule: ruleId, impact: v.impact ?? null, helpUrl: v.helpUrl ?? null },
        },
      ],
    });
  }
  return findings;
}

function lighthouseToFinding(deployUrl: string, lh: LighthouseResult): NormalizedFinding | null {
  if (lh.performance === null && lh.accessibility === null) return null;
  const perfPct = lh.performance ?? -1;
  const accPct = lh.accessibility ?? -1;
  const severity: 'P0' | 'P1' | 'P2' | 'P3' =
    perfPct >= 0 && perfPct < 50 ? 'P1' : accPct >= 0 && accPct < 70 ? 'P1' : 'P2';
  return {
    title: 'Lighthouse 성능/접근성 점수',
    category: 'LAUNCH_READINESS',
    severity,
    confidence: 'MEDIUM',
    summary: `Profile: ${lh.profileId} | Performance ${perfPct}, Accessibility ${accPct}, SEO ${lh.seo ?? '?'}.`,
    nonDeveloperExplanation:
      '페이지 로딩 속도 및 접근성 점수입니다. 70 미만이면 사용자 이탈이 늘어날 수 있습니다.',
    technicalExplanation: `Profile=${lh.profileId}, LCP=${lh.lcpMs ?? '?'}ms, CLS=${lh.clsScore ?? '?'}.`,
    impact: '느린 페이지는 SEO 및 전환율에 부정적 영향을 줍니다.',
    recommendation: '핵심 LCP 자원, 메인 JS 번들, 이미지 최적화부터 점검하세요.',
    acceptanceCriteria: ['Lighthouse Performance 점수가 70 이상이 된다.'],
    tags: ['lighthouse', 'performance', `profile:${lh.profileId}`],
    evidences: [
      {
        type: 'LIGHTHOUSE',
        source: 'lighthouse',
        path: null,
        lineStart: null,
        lineEnd: null,
        url: deployUrl,
        selector: null,
        screenshotPath: null,
        snippet: null,
        maskedValue: null,
        metadata: {
          profileId: lh.profileId,
          performance: lh.performance,
          accessibility: lh.accessibility,
          bestPractices: lh.bestPractices,
          seo: lh.seo,
          lcpMs: lh.lcpMs,
          cls: lh.clsScore,
        },
      },
    ],
  };
}

interface PlaywrightOutcome {
  stats: PageStats | null;
  axe: AxeResult | null;
  toolNotInstalled: boolean;
  error: string | null;
}

async function runPlaywright(deployUrl: string): Promise<PlaywrightOutcome> {
  let pw: typeof import('playwright') | null = null;
  let axeMod: typeof import('@axe-core/playwright') | null = null;
  try {
    pw = await import('playwright');
  } catch (e) {
    return { stats: null, axe: null, toolNotInstalled: true, error: (e as Error).message };
  }
  try {
    axeMod = await import('@axe-core/playwright');
  } catch {
    /* axe optional — continue without */
  }

  let browser: import('playwright').Browser | null = null;
  try {
    browser = await pw.chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(deployUrl, { timeout: NAV_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
    const stats: PageStats = await page.evaluate<PageStats>(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = (globalThis as any).document;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const loc = (globalThis as any).location;
      return {
        url: loc.href as string,
        buttonCount: doc.querySelectorAll('button').length as number,
        linkCount: doc.querySelectorAll('a[href]').length as number,
        formCount: doc.querySelectorAll('form').length as number,
      };
    });

    let axe: AxeResult | null = null;
    if (axeMod) {
      try {
        const builder = new axeMod.AxeBuilder({ page });
        axe = (await builder.analyze()) as AxeResult;
      } catch {
        /* swallow axe errors — non-fatal */
      }
    }

    return { stats, axe, toolNotInstalled: false, error: null };
  } catch (e) {
    return {
      stats: null,
      axe: null,
      toolNotInstalled: false,
      error: (e as Error).message,
    };
  } finally {
    try {
      await browser?.close();
    } catch {
      /* swallow */
    }
  }
}

async function runLighthouse(
  deployUrl: string,
  profile: LighthouseProfile,
): Promise<LighthouseResult | { notInstalled: true }> {
  let lhMod: { default?: unknown } & Record<string, unknown>;
  let cl: typeof import('chrome-launcher');
  try {
    lhMod = (await import('lighthouse')) as typeof lhMod;
    cl = await import('chrome-launcher');
  } catch {
    return { notInstalled: true };
  }

  const launcher = await cl.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
  });

  try {
    const lighthouseFn = (lhMod.default ?? lhMod) as (
      url: string,
      opts: Record<string, unknown>,
    ) => Promise<{ lhr?: Record<string, unknown> }>;
    const runner = await Promise.race([
      lighthouseFn(deployUrl, {
        port: launcher.port,
        output: 'json',
        logLevel: 'silent',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        ...toLighthouseSettings(profile),
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('lighthouse timeout')), LH_TIMEOUT_MS),
      ),
    ]);
    const lhr = (runner?.lhr ?? {}) as {
      categories?: Record<string, { score?: number | null }>;
      audits?: Record<string, { numericValue?: number | null }>;
    };
    const pct = (cat: string): number | null => {
      const s = lhr.categories?.[cat]?.score;
      return typeof s === 'number' ? Math.round(s * 100) : null;
    };
    return {
      performance: pct('performance'),
      accessibility: pct('accessibility'),
      bestPractices: pct('best-practices'),
      seo: pct('seo'),
      lcpMs: lhr.audits?.['largest-contentful-paint']?.numericValue ?? null,
      clsScore: lhr.audits?.['cumulative-layout-shift']?.numericValue ?? null,
      profileId: profile.id,
    };
  } finally {
    try {
      await launcher.kill();
    } catch {
      /* swallow */
    }
  }
}

export const step09AnalyzeDeployUrl: Step = {
  step: 'ANALYZE_DEPLOY_URL',
  async execute(ctx, state) {
    if (!ctx.deployUrl) {
      ctx.log('info', 'Deploy URL analysis skipped (no URL provided)');
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: 'lighthouse-axe',
        toolVersion: 'n/a',
        status: 'SKIPPED',
        rawSummary: { reason: 'no deploy url' },
        artifactPath: null,
      });
      return;
    }

    const deployUrl = ctx.deployUrl;
    const pw = await runPlaywright(deployUrl).catch((e: Error) => ({
      stats: null,
      axe: null,
      toolNotInstalled: false,
      error: e.message,
    }));

    if (pw.toolNotInstalled) {
      ctx.log('warn', 'Playwright not installed; skipping deploy URL analysis', {
        error: pw.error,
      });
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: 'playwright-axe',
        toolVersion: 'n/a',
        status: 'SKIPPED',
        rawSummary: { reason: 'playwright not installed' },
        artifactPath: null,
      });
    } else if (pw.error) {
      ctx.log('warn', 'Playwright run failed', { error: pw.error });
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: 'playwright-axe',
        toolVersion: 'unknown',
        status: 'FAILED',
        rawSummary: { error: pw.error },
        artifactPath: null,
      });
    } else {
      const axeFindings = pw.axe ? axeToFindings(deployUrl, pw.axe) : [];
      state.pendingFindings.push(...axeFindings);
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: 'playwright-axe',
        toolVersion: 'unknown',
        status: 'SUCCESS',
        rawSummary: {
          axeViolations: axeFindings.length,
          buttons: pw.stats?.buttonCount ?? null,
          links: pw.stats?.linkCount ?? null,
          forms: pw.stats?.formCount ?? null,
        },
        artifactPath: null,
      });
    }

    const { profile, fallback: profileFallback } = resolveLighthouseProfile(
      process.env.LIGHTHOUSE_PROFILE,
    );
    if (profileFallback) {
      ctx.log('warn', 'Unknown LIGHTHOUSE_PROFILE; falling back to default', {
        requested: process.env.LIGHTHOUSE_PROFILE,
        applied: profile.id,
      });
    }

    const lhStartMs = Date.now();
    const lhResult = await runLighthouse(deployUrl, profile).catch(
      (e: Error) => ({ notInstalled: false as const, error: e.message }),
    );
    recordLighthouseLatency((Date.now() - lhStartMs) / 1000, profile.id);

    if ('notInstalled' in lhResult && lhResult.notInstalled) {
      ctx.log('warn', 'Lighthouse not installed; skipping', { profile: profile.id });
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: 'lighthouse',
        toolVersion: 'n/a',
        status: 'SKIPPED',
        rawSummary: { reason: 'lighthouse or chrome-launcher not installed', profile: profile.id },
        artifactPath: null,
      });
    } else if ('error' in lhResult) {
      ctx.log('warn', 'Lighthouse failed', { error: lhResult.error, profile: profile.id });
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: 'lighthouse',
        toolVersion: 'unknown',
        status: 'FAILED',
        rawSummary: { error: lhResult.error, profile: profile.id },
        artifactPath: null,
      });
    } else {
      const lh = lhResult as LighthouseResult;
      const finding = lighthouseToFinding(deployUrl, lh);
      if (finding) state.pendingFindings.push(finding);
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: 'lighthouse',
        toolVersion: 'unknown',
        status: 'SUCCESS',
        rawSummary: {
          profile: profile.id,
          performance: lh.performance,
          accessibility: lh.accessibility,
          bestPractices: lh.bestPractices,
          seo: lh.seo,
        },
        artifactPath: null,
      });
    }

    // BUG-1: mark as executed only when deployUrl was actually probed.
    // Skipped early-return above leaves UX_UI / LAUNCH_READINESS measuredBy
    // unsatisfied → scorer treats those categories as N/A.
    recordStepOutcome(state, 'ANALYZE_DEPLOY_URL', 'CHECKPOINT');
    ctx.log('info', 'Deploy URL analysis complete');
  },
};
