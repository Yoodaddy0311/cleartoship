// Tests for the VALIDATE_INPUT pipeline step (01-validate-input.ts).
//
// SECURITY: this step is the worker-side SSRF defense layer. The web app
// already rejects bad URLs at POST time, but the worker re-validates because
// the queue hop is not authoritative. These tests pin the contract.
//
// Strategy:
//   - Mock node:dns's `promises.lookup` so we can deterministically simulate
//     hostnames that resolve to public vs. private addresses without making
//     real DNS calls in CI.
//   - For literal-IP URLs, parseDeployUrl rejects synchronously before DNS
//     is touched, so the mock is irrelevant for those cases.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerCtx } from '../../adapters/index.js';
import { createInitialState, type PipelineState } from './index.js';

const { dnsLookupMock } = vi.hoisted(() => ({
  dnsLookupMock: vi.fn(),
}));

vi.mock('node:dns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:dns')>();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      lookup: dnsLookupMock,
    },
  };
});

function makeCtx(overrides: Partial<WorkerCtx> = {}): WorkerCtx {
  return {
    runId: 'run-validate-' + Math.random().toString(36).slice(2, 10),
    projectId: 'proj-1',
    ownerId: 'owner-1',
    repoUrl: 'https://github.com/example/repo',
    deployUrl: null,
    prdText: null,
    profileId: null,
    clonePath: null,
    log: vi.fn(),
    ...overrides,
  };
}

describe('step01ValidateInput — repo URL', () => {
  let step: typeof import('./01-validate-input.js').step01ValidateInput;

  beforeEach(async () => {
    dnsLookupMock.mockReset();
    // Default: hostname resolves to a public address so deploy-url checks pass
    // unless a test overrides.
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    vi.resetModules();
    ({ step01ValidateInput: step } = await import('./01-validate-input.js'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a valid public https github URL', async () => {
    const ctx = makeCtx({ repoUrl: 'https://github.com/vercel/next.js' });
    const state: PipelineState = createInitialState();
    await expect(step.execute(ctx, state)).resolves.toBeUndefined();
  });

  it('rejects a non-github URL', async () => {
    const ctx = makeCtx({ repoUrl: 'https://gitlab.com/owner/repo' });
    const state: PipelineState = createInitialState();
    await expect(step.execute(ctx, state)).rejects.toThrow(/GitHub Repo URL/);
  });

  it('rejects a malformed repo URL', async () => {
    const ctx = makeCtx({ repoUrl: 'not-a-url' });
    const state: PipelineState = createInitialState();
    await expect(step.execute(ctx, state)).rejects.toThrow(/GitHub Repo URL/);
  });
});

describe('step01ValidateInput — deploy URL SSRF defense (P1)', () => {
  let step: typeof import('./01-validate-input.js').step01ValidateInput;

  beforeEach(async () => {
    dnsLookupMock.mockReset();
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    vi.resetModules();
    ({ step01ValidateInput: step } = await import('./01-validate-input.js'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a valid public https deploy URL', async () => {
    const ctx = makeCtx({ deployUrl: 'https://my-app.vercel.app' });
    const state: PipelineState = createInitialState();
    await expect(step.execute(ctx, state)).resolves.toBeUndefined();
    expect(dnsLookupMock).toHaveBeenCalledWith('my-app.vercel.app', { all: true });
  });

  it('passes when deployUrl is null (optional field)', async () => {
    const ctx = makeCtx({ deployUrl: null });
    const state: PipelineState = createInitialState();
    await expect(step.execute(ctx, state)).resolves.toBeUndefined();
    // No DNS lookup performed when deployUrl is absent.
    expect(dnsLookupMock).not.toHaveBeenCalled();
  });

  it('rejects private IP literal 10.0.0.1 (RFC1918) without DNS', async () => {
    const ctx = makeCtx({ deployUrl: 'http://10.0.0.1/' });
    const state: PipelineState = createInitialState();
    await expect(step.execute(ctx, state)).rejects.toThrow(/SSRF 차단.*사설 IP/);
    expect(dnsLookupMock).not.toHaveBeenCalled();
  });

  it('rejects private IP literal 192.168.1.1', async () => {
    const ctx = makeCtx({ deployUrl: 'http://192.168.1.1/' });
    const state: PipelineState = createInitialState();
    await expect(step.execute(ctx, state)).rejects.toThrow(/SSRF 차단/);
  });

  it('rejects localhost hostname after DNS resolution path', async () => {
    // localhost is rejected by the literal-hostname check before DNS even runs.
    const ctx = makeCtx({ deployUrl: 'http://localhost:8080/' });
    const state: PipelineState = createInitialState();
    await expect(step.execute(ctx, state)).rejects.toThrow(/SSRF 차단.*사설 IP/);
  });

  it('rejects a public-looking hostname that DNS-resolves to a private IP (rebinding)', async () => {
    // Attacker controls public-hostname.example whose DNS A record points
    // at 10.0.0.5. Web-side parseDeployUrl would pass (no DNS), but the
    // worker's validateDeployUrl must catch this.
    // Use persistent mockResolvedValue (not Once) because rejects.toThrow
    // executes the promise factory twice if we chained two matchers — we
    // assert once here against a combined regex instead.
    dnsLookupMock.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
    const ctx = makeCtx({ deployUrl: 'https://attacker-rebind.example' });
    const state: PipelineState = createInitialState();
    await expect(step.execute(ctx, state)).rejects.toThrow(
      /SSRF 차단.*사설\/내부 IP/,
    );
  });

  it('rejects file:// scheme', async () => {
    const ctx = makeCtx({ deployUrl: 'file:///etc/passwd' });
    const state: PipelineState = createInitialState();
    await expect(step.execute(ctx, state)).rejects.toThrow(
      /SSRF 차단.*http 또는 https/,
    );
  });

  it('rejects javascript: scheme', async () => {
    const ctx = makeCtx({ deployUrl: 'javascript:alert(1)' });
    const state: PipelineState = createInitialState();
    await expect(step.execute(ctx, state)).rejects.toThrow(/SSRF 차단/);
  });

  it('rejects GCP metadata IP 169.254.169.254', async () => {
    const ctx = makeCtx({ deployUrl: 'http://169.254.169.254/latest/meta-data/' });
    const state: PipelineState = createInitialState();
    await expect(step.execute(ctx, state)).rejects.toThrow(/SSRF 차단/);
    expect(dnsLookupMock).not.toHaveBeenCalled();
  });

  it('rejects metadata.google.internal hostname', async () => {
    const ctx = makeCtx({ deployUrl: 'http://metadata.google.internal/' });
    const state: PipelineState = createInitialState();
    await expect(step.execute(ctx, state)).rejects.toThrow(/SSRF 차단/);
  });

  it('rejects IPv6 loopback ::1', async () => {
    const ctx = makeCtx({ deployUrl: 'http://[::1]/' });
    const state: PipelineState = createInitialState();
    await expect(step.execute(ctx, state)).rejects.toThrow(/SSRF 차단/);
  });

  it('rejects when DNS resolves to IPv6 metadata-mapped address', async () => {
    dnsLookupMock.mockResolvedValue([{ address: 'fc00::1', family: 6 }]);
    const ctx = makeCtx({ deployUrl: 'https://stealthy-ipv6.example' });
    const state: PipelineState = createInitialState();
    await expect(step.execute(ctx, state)).rejects.toThrow(/SSRF 차단.*IPv6/);
  });
});
