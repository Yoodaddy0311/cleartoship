// Tests for the ANALYZE_DEPLOY_URL pipeline step (09-analyze-deploy-url.ts).
//
// Strategy:
//   - Mock each lazily-imported external module: `playwright`, `@axe-core/playwright`,
//     `lighthouse`, `chrome-launcher`. The step calls `await import(...)`; vi.mock
//     intercepts the resolver so we can return a stub, or throw to simulate
//     "not installed".
//   - Mock `../../firestore/writers.js` to capture `writeToolResult` calls.
//   - Build `WorkerCtx` and `PipelineState` inline; the step pushes axe/lh
//     findings to `state.pendingFindings`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerCtx } from '../../adapters/index.js';
import { createInitialState, type PipelineState } from './index.js';

const {
  writeToolResultMock,
  chromiumLaunchMock,
  axeAnalyzeMock,
  lighthouseMock,
  chromeLauncherLaunchMock,
  chromeLauncherKillMock,
} = vi.hoisted(() => ({
  writeToolResultMock: vi.fn(async () => 'tr-id'),
  chromiumLaunchMock: vi.fn(),
  axeAnalyzeMock: vi.fn(),
  lighthouseMock: vi.fn(),
  chromeLauncherLaunchMock: vi.fn(),
  chromeLauncherKillMock: vi.fn(async () => undefined),
}));

vi.mock('../../firestore/writers.js', () => ({
  writeToolResult: writeToolResultMock,
  setRunCommitHash: vi.fn(),
}));

// Default mocks — individual tests override with mockImplementationOnce.
vi.mock('playwright', () => ({
  chromium: { launch: chromiumLaunchMock },
}));

vi.mock('@axe-core/playwright', () => ({
  AxeBuilder: class {
    analyze = axeAnalyzeMock;
  },
}));

vi.mock('lighthouse', () => ({
  default: lighthouseMock,
}));

vi.mock('chrome-launcher', () => ({
  launch: chromeLauncherLaunchMock,
}));

function makeCtx(overrides: Partial<WorkerCtx> = {}): WorkerCtx {
  return {
    runId: 'run-deploy-' + Math.random().toString(36).slice(2, 10),
    projectId: 'proj-1',
    ownerId: 'owner-1',
    repoUrl: 'https://github.com/example/repo',
    deployUrl: 'https://example.com',
    prdText: null,
    clonePath: null,
    log: vi.fn(),
    ...overrides,
  };
}

function makeBrowserStub(opts: {
  stats?: { url: string; buttonCount: number; linkCount: number; formCount: number };
  navigateError?: string;
} = {}): unknown {
  const stats = opts.stats ?? {
    url: 'https://example.com',
    buttonCount: 3,
    linkCount: 10,
    formCount: 1,
  };
  const page = {
    goto: vi.fn(async () => {
      if (opts.navigateError) throw new Error(opts.navigateError);
    }),
    evaluate: vi.fn(async () => stats),
  };
  const browserCtx = {
    newPage: vi.fn(async () => page),
  };
  return {
    newContext: vi.fn(async () => browserCtx),
    close: vi.fn(async () => undefined),
  };
}

function makeLighthouseLhr(scores: {
  performance?: number | null;
  accessibility?: number | null;
  bestPractices?: number | null;
  seo?: number | null;
  lcpMs?: number | null;
  cls?: number | null;
}): { lhr: Record<string, unknown> } {
  const cat = (s: number | null | undefined) =>
    s === null || s === undefined ? { score: null } : { score: s / 100 };
  return {
    lhr: {
      categories: {
        performance: cat(scores.performance),
        accessibility: cat(scores.accessibility),
        'best-practices': cat(scores.bestPractices),
        seo: cat(scores.seo),
      },
      audits: {
        'largest-contentful-paint': { numericValue: scores.lcpMs ?? null },
        'cumulative-layout-shift': { numericValue: scores.cls ?? null },
      },
    },
  };
}

describe('step09AnalyzeDeployUrl', () => {
  let step: typeof import('./09-analyze-deploy-url.js').step09AnalyzeDeployUrl;

  beforeEach(async () => {
    writeToolResultMock.mockClear();
    chromiumLaunchMock.mockReset();
    axeAnalyzeMock.mockReset();
    lighthouseMock.mockReset();
    chromeLauncherLaunchMock.mockReset();
    chromeLauncherKillMock.mockClear();
    vi.resetModules();
    ({ step09AnalyzeDeployUrl: step } = await import('./09-analyze-deploy-url.js'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deployUrl missing: writes SKIPPED tool result and returns', async () => {
    const ctx = makeCtx({ deployUrl: null });
    const state: PipelineState = createInitialState();

    await step.execute(ctx, state);

    expect(chromiumLaunchMock).not.toHaveBeenCalled();
    expect(lighthouseMock).not.toHaveBeenCalled();
    expect(writeToolResultMock).toHaveBeenCalledTimes(1);
    const call = writeToolResultMock.mock.calls[0]![0] as {
      status: string;
      toolName: string;
      rawSummary: { reason: string };
    };
    expect(call.status).toBe('SKIPPED');
    expect(call.toolName).toBe('lighthouse-axe');
    expect(call.rawSummary.reason).toContain('no deploy url');
    expect(state.pendingFindings).toHaveLength(0);
  });

  it('happy path: pushes axe + lighthouse findings, writes two SUCCESS tool results', async () => {
    const ctx = makeCtx();
    const state: PipelineState = createInitialState();
    chromiumLaunchMock.mockResolvedValueOnce(makeBrowserStub());
    axeAnalyzeMock.mockResolvedValueOnce({
      violations: [
        {
          id: 'color-contrast',
          impact: 'serious',
          description: 'Insufficient contrast',
          help: 'Elements must have sufficient color contrast',
          helpUrl: 'https://axe/rules/color-contrast',
          nodes: [{ target: ['button.primary'], html: '<button>x</button>' }],
        },
        {
          id: 'image-alt',
          impact: 'critical',
          help: 'Images must have alt text',
          nodes: [{ target: ['img.hero'] }],
        },
      ],
    });
    chromeLauncherLaunchMock.mockResolvedValueOnce({
      port: 9222,
      kill: chromeLauncherKillMock,
    });
    lighthouseMock.mockResolvedValueOnce(
      makeLighthouseLhr({ performance: 85, accessibility: 92, bestPractices: 88, seo: 90, lcpMs: 1200, cls: 0.05 }),
    );

    await step.execute(ctx, state);

    // Two axe findings + one lighthouse finding.
    expect(state.pendingFindings).toHaveLength(3);
    const axeFinding = state.pendingFindings.find((f) => f.tags.includes('axe'))!;
    expect(axeFinding.category).toBe('UX_UI');
    expect(['P0', 'P1']).toContain(axeFinding.severity);
    expect(axeFinding.evidences[0]!.url).toBe('https://example.com');

    const lhFinding = state.pendingFindings.find((f) => f.tags.includes('lighthouse'))!;
    expect(lhFinding.category).toBe('LAUNCH_READINESS');
    expect(lhFinding.evidences[0]!.metadata).toMatchObject({
      performance: 85,
      accessibility: 92,
    });

    // Two SUCCESS writes: playwright-axe, lighthouse.
    const statuses = writeToolResultMock.mock.calls.map(
      (c) => (c[0] as { status: string; toolName: string }),
    );
    expect(statuses.some((s) => s.toolName === 'playwright-axe' && s.status === 'SUCCESS')).toBe(true);
    expect(statuses.some((s) => s.toolName === 'lighthouse' && s.status === 'SUCCESS')).toBe(true);
  });

  it('playwright crash (navigation error): writes FAILED but pipeline survives', async () => {
    const ctx = makeCtx();
    const state: PipelineState = createInitialState();
    chromiumLaunchMock.mockResolvedValueOnce(makeBrowserStub({ navigateError: 'net::ERR_TIMEOUT' }));
    // Lighthouse still attempted — provide a not-installed simulation by
    // making chrome-launcher throw.
    chromeLauncherLaunchMock.mockRejectedValueOnce(new Error('no chrome'));

    await expect(step.execute(ctx, state)).resolves.toBeUndefined();

    const pwCall = writeToolResultMock.mock.calls.find(
      (c) => (c[0] as { toolName: string }).toolName === 'playwright-axe',
    )![0] as { status: string; rawSummary: { error: string } };
    expect(pwCall.status).toBe('FAILED');
    expect(pwCall.rawSummary.error).toContain('ERR_TIMEOUT');
  });

  it('axe optional: when analyze throws, playwright still SUCCESS with 0 axe violations', async () => {
    const ctx = makeCtx();
    const state: PipelineState = createInitialState();
    chromiumLaunchMock.mockResolvedValueOnce(makeBrowserStub());
    // Simulate axe-core failing at runtime — the step swallows the error and
    // proceeds with axe=null (equivalent to "axe not available").
    axeAnalyzeMock.mockRejectedValueOnce(new Error('axe runtime error'));
    // Skip lighthouse via chrome-launcher failure for isolation.
    chromeLauncherLaunchMock.mockRejectedValueOnce(new Error('no chrome'));

    await step.execute(ctx, state);

    const pwCall = writeToolResultMock.mock.calls.find(
      (c) => (c[0] as { toolName: string }).toolName === 'playwright-axe',
    )![0] as { status: string; rawSummary: { axeViolations: number } };
    expect(pwCall.status).toBe('SUCCESS');
    expect(pwCall.rawSummary.axeViolations).toBe(0);
  });

  it('lighthouse crash: writes FAILED but pipeline survives', async () => {
    const ctx = makeCtx();
    const state: PipelineState = createInitialState();
    chromiumLaunchMock.mockResolvedValueOnce(makeBrowserStub());
    axeAnalyzeMock.mockResolvedValueOnce({ violations: [] });
    chromeLauncherLaunchMock.mockResolvedValueOnce({
      port: 9222,
      kill: chromeLauncherKillMock,
    });
    lighthouseMock.mockRejectedValueOnce(new Error('lighthouse exploded'));

    await expect(step.execute(ctx, state)).resolves.toBeUndefined();

    const lhCall = writeToolResultMock.mock.calls.find(
      (c) => (c[0] as { toolName: string }).toolName === 'lighthouse',
    )![0] as { status: string; rawSummary: { error: string } };
    expect(lhCall.status).toBe('FAILED');
    expect(lhCall.rawSummary.error).toContain('lighthouse exploded');
  });

  it('lighthouse low performance score: classifies finding as P1 severity', async () => {
    const ctx = makeCtx();
    const state: PipelineState = createInitialState();
    chromiumLaunchMock.mockResolvedValueOnce(makeBrowserStub());
    axeAnalyzeMock.mockResolvedValueOnce({ violations: [] });
    chromeLauncherLaunchMock.mockResolvedValueOnce({
      port: 9222,
      kill: chromeLauncherKillMock,
    });
    lighthouseMock.mockResolvedValueOnce(
      makeLighthouseLhr({ performance: 30, accessibility: 80, bestPractices: 75, seo: 70 }),
    );

    await step.execute(ctx, state);

    const lhFinding = state.pendingFindings.find((f) => f.tags.includes('lighthouse'))!;
    expect(lhFinding.severity).toBe('P1');
  });

  it('axe-core severity mapping: critical->P0, serious->P1, moderate->P2, other->P3', async () => {
    const ctx = makeCtx();
    const state: PipelineState = createInitialState();
    chromiumLaunchMock.mockResolvedValueOnce(makeBrowserStub());
    axeAnalyzeMock.mockResolvedValueOnce({
      violations: [
        { id: 'a', impact: 'critical', help: 'A' },
        { id: 'b', impact: 'serious', help: 'B' },
        { id: 'c', impact: 'moderate', help: 'C' },
        { id: 'd', impact: 'minor', help: 'D' },
      ],
    });
    chromeLauncherLaunchMock.mockImplementationOnce(() => {
      throw new Error('skip lh'); // skip lighthouse for isolation
    });

    await step.execute(ctx, state);

    const axe = state.pendingFindings.filter((f) => f.tags.includes('axe'));
    expect(axe).toHaveLength(4);
    expect(axe.map((f) => f.severity)).toEqual(['P0', 'P1', 'P2', 'P3']);
  });
});
