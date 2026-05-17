// T2.8 Phase 2 — tests for step 13b ANALYZE_BUSINESS_READINESS.
//
// Exercises the 5 detectors against a real (temporary) clone fixture so the
// regex + path lookup logic is covered end-to-end. Each test seeds the
// minimum file shape required to flip a single evidence-key.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { WorkerCtx } from '../../adapters/index.js';
import {
  collectBusinessEvidence,
  step13bAnalyzeBusinessReadiness,
} from './13b-analyze-business-readiness.js';
import { createInitialState } from './index.js';

async function makeFixture(): Promise<string> {
  return await fsp.mkdtemp(path.join(os.tmpdir(), 'ct-step13b-'));
}

async function writeFile(root: string, rel: string, body: string): Promise<void> {
  const abs = path.join(root, rel);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, body, 'utf8');
}

function makeCtx(clonePath: string | null): WorkerCtx {
  return {
    runId: 'run-13b',
    projectId: 'proj-1',
    ownerId: 'owner-1',
    repoUrl: 'https://github.com/example/repo',
    deployUrl: null,
    prdText: null,
    profileId: null,
    clonePath,
    log: vi.fn(),
  };
}

describe('step13bAnalyzeBusinessReadiness', () => {
  const fixtures: string[] = [];

  beforeEach(() => {
    fixtures.length = 0;
  });

  afterEach(async () => {
    for (const dir of fixtures) {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it('step.step is ANALYZE_BUSINESS_READINESS', () => {
    expect(step13bAnalyzeBusinessReadiness.step).toBe('ANALYZE_BUSINESS_READINESS');
  });

  it('without clonePath: businessEvidence stays as default empty', async () => {
    const ctx = makeCtx(null);
    const state = createInitialState();
    await step13bAnalyzeBusinessReadiness.execute(ctx, state);
    expect(state.businessEvidence.PRICING_PAGE_PRESENT).toBe(false);
    expect(state.businessEvidence.LEGAL_DOCS_PRESENT).toBe(false);
    expect(state.businessEvidence.ONBOARDING_FLOW_PRESENT).toBe(false);
    expect(state.businessEvidence.SUPPORT_CHANNEL_PRESENT).toBe(false);
    expect(state.businessEvidence.ANALYTICS_INSTALLED).toBe(false);
    expect(state.executedSteps).not.toContain('ANALYZE_BUSINESS_READINESS');
  });

  it('empty clone → all 5 evidence keys remain false', async () => {
    const root = await makeFixture();
    fixtures.push(root);
    const evidence = await collectBusinessEvidence(root);
    expect(evidence).toEqual({
      PRICING_PAGE_PRESENT: false,
      LEGAL_DOCS_PRESENT: false,
      ONBOARDING_FLOW_PRESENT: false,
      SUPPORT_CHANNEL_PRESENT: false,
      ANALYTICS_INSTALLED: false,
    });
  });

  // -- Pricing detector ----------------------------------------------------

  it('Pricing: app/pricing/page.tsx → PRICING_PAGE_PRESENT=true', async () => {
    const root = await makeFixture();
    fixtures.push(root);
    await writeFile(root, 'app/pricing/page.tsx', 'export default function Page(){return null;}');
    const evidence = await collectBusinessEvidence(root);
    expect(evidence.PRICING_PAGE_PRESENT).toBe(true);
  });

  it('Pricing: pages/plans.tsx → PRICING_PAGE_PRESENT=true', async () => {
    const root = await makeFixture();
    fixtures.push(root);
    await writeFile(root, 'pages/plans.tsx', 'export default () => null;');
    const evidence = await collectBusinessEvidence(root);
    expect(evidence.PRICING_PAGE_PRESENT).toBe(true);
  });

  it('Pricing: README mentioning /billing → PRICING_PAGE_PRESENT=true (fallback)', async () => {
    const root = await makeFixture();
    fixtures.push(root);
    await writeFile(root, 'README.md', '## Routes\n- /billing — manage subscription\n');
    const evidence = await collectBusinessEvidence(root);
    expect(evidence.PRICING_PAGE_PRESENT).toBe(true);
  });

  it('Pricing: no relevant files → PRICING_PAGE_PRESENT=false', async () => {
    const root = await makeFixture();
    fixtures.push(root);
    await writeFile(root, 'README.md', '# A repo without commerce.');
    await writeFile(root, 'pages/index.tsx', 'export default () => null;');
    const evidence = await collectBusinessEvidence(root);
    expect(evidence.PRICING_PAGE_PRESENT).toBe(false);
  });

  // -- Onboarding detector -------------------------------------------------

  it('Onboarding: app/signup/page.tsx → ONBOARDING_FLOW_PRESENT=true', async () => {
    const root = await makeFixture();
    fixtures.push(root);
    await writeFile(root, 'app/signup/page.tsx', 'export default () => null;');
    const evidence = await collectBusinessEvidence(root);
    expect(evidence.ONBOARDING_FLOW_PRESENT).toBe(true);
  });

  it('Onboarding: pages/register.tsx → ONBOARDING_FLOW_PRESENT=true', async () => {
    const root = await makeFixture();
    fixtures.push(root);
    await writeFile(root, 'pages/register.tsx', 'export default () => null;');
    const evidence = await collectBusinessEvidence(root);
    expect(evidence.ONBOARDING_FLOW_PRESENT).toBe(true);
  });

  it('Onboarding: README mentions /get-started → ONBOARDING_FLOW_PRESENT=true', async () => {
    const root = await makeFixture();
    fixtures.push(root);
    await writeFile(root, 'README.md', 'Visit /get-started for the tutorial.');
    const evidence = await collectBusinessEvidence(root);
    expect(evidence.ONBOARDING_FLOW_PRESENT).toBe(true);
  });

  it('Onboarding: no signup/register/onboarding routes → ONBOARDING_FLOW_PRESENT=false', async () => {
    const root = await makeFixture();
    fixtures.push(root);
    await writeFile(root, 'README.md', '# Just a CLI tool.');
    const evidence = await collectBusinessEvidence(root);
    expect(evidence.ONBOARDING_FLOW_PRESENT).toBe(false);
  });

  // -- Support detector ----------------------------------------------------

  it('Support: app/contact/page.tsx → SUPPORT_CHANNEL_PRESENT=true (route)', async () => {
    const root = await makeFixture();
    fixtures.push(root);
    await writeFile(root, 'app/contact/page.tsx', 'export default () => null;');
    const evidence = await collectBusinessEvidence(root);
    expect(evidence.SUPPORT_CHANNEL_PRESENT).toBe(true);
  });

  it('Support: mailto:support@example.com in components/Footer.tsx → SUPPORT_CHANNEL_PRESENT=true', async () => {
    const root = await makeFixture();
    fixtures.push(root);
    await writeFile(
      root,
      'components/Footer.tsx',
      'export default () => (<a href="mailto:support@example.com">Email us</a>);',
    );
    const evidence = await collectBusinessEvidence(root);
    expect(evidence.SUPPORT_CHANNEL_PRESENT).toBe(true);
  });

  it('Support: README mentions /help → SUPPORT_CHANNEL_PRESENT=true', async () => {
    const root = await makeFixture();
    fixtures.push(root);
    await writeFile(root, 'README.md', 'Need help? Visit /help for docs.');
    const evidence = await collectBusinessEvidence(root);
    expect(evidence.SUPPORT_CHANNEL_PRESENT).toBe(true);
  });

  it('Support: no contact/support/mailto → SUPPORT_CHANNEL_PRESENT=false', async () => {
    const root = await makeFixture();
    fixtures.push(root);
    await writeFile(root, 'README.md', '# A repo without support surface.');
    await writeFile(root, 'components/Footer.tsx', 'export default () => <footer>© 2026</footer>;');
    const evidence = await collectBusinessEvidence(root);
    expect(evidence.SUPPORT_CHANNEL_PRESENT).toBe(false);
  });

  // -- Combined / state-level ---------------------------------------------

  it('full PASS shape: all 5 evidence keys flip when each signal is seeded', async () => {
    const root = await makeFixture();
    fixtures.push(root);
    await writeFile(root, 'app/pricing/page.tsx', 'export default () => null;');
    await writeFile(root, 'privacy-policy.md', '# Privacy');
    await writeFile(root, 'app/signup/page.tsx', 'export default () => null;');
    await writeFile(
      root,
      'components/Footer.tsx',
      '<a href="mailto:hello@example.com">contact</a>',
    );
    await writeFile(
      root,
      'app/layout.tsx',
      '<script src="https://www.googletagmanager.com/gtag/js?id=GA-1" />',
    );
    const evidence = await collectBusinessEvidence(root);
    expect(evidence).toEqual({
      PRICING_PAGE_PRESENT: true,
      LEGAL_DOCS_PRESENT: true,
      ONBOARDING_FLOW_PRESENT: true,
      SUPPORT_CHANNEL_PRESENT: true,
      ANALYTICS_INSTALLED: true,
    });
  });

  it('step writes businessEvidence into PipelineState and records executedSteps', async () => {
    const root = await makeFixture();
    fixtures.push(root);
    await writeFile(root, 'app/pricing/page.tsx', 'export default () => null;');
    const ctx = makeCtx(root);
    const state = createInitialState();
    await step13bAnalyzeBusinessReadiness.execute(ctx, state);
    expect(state.businessEvidence.PRICING_PAGE_PRESENT).toBe(true);
    expect(state.executedSteps).toContain('ANALYZE_BUSINESS_READINESS');
  });
});
