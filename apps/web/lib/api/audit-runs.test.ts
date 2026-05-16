// Unit tests for the audit-runs API client wrappers.
// apiFetch is mocked — these tests verify URL composition, query-string handling,
// and that responses are validated against the shared zod schemas.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock('./client', () => ({
  apiFetch: apiFetchMock,
  ApiHttpError: class ApiHttpError extends Error {},
}));

const ISO = '2026-05-16T05:00:00.000Z';

function sampleAuditRun(over: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    projectId: 'proj-1',
    ownerId: 'user-1',
    status: 'RUNNING',
    currentStep: 'RUN_STATIC_ANALYSIS',
    progress: 42,
    commitHash: 'abc123',
    startedAt: ISO,
    completedAt: null,
    errorMessage: null,
    createdAt: ISO,
    updatedAt: ISO,
    repoUrl: 'https://github.com/owner/repo',
    deployUrl: 'https://example.com',
    prdText: null,
    enqueueMode: 'cloud-tasks',
    ...over,
  };
}

function sampleFinding(over: Record<string, unknown> = {}) {
  return {
    id: 'f-1',
    auditRunId: 'run-1',
    title: 'Sample finding',
    category: 'SECURITY_PRIVACY',
    severity: 'P1',
    confidence: 'HIGH',
    status: 'OPEN',
    summary: 'summary',
    nonDeveloperExplanation: null,
    technicalExplanation: null,
    impact: null,
    recommendation: null,
    acceptanceCriteria: [],
    tags: [],
    evidenceCount: 0,
    createdAt: ISO,
    ...over,
  };
}

function sampleEvidence(over: Record<string, unknown> = {}) {
  return {
    id: 'e-1',
    auditRunId: 'run-1',
    findingId: 'f-1',
    type: 'CODE_SNIPPET',
    source: 'static-analyzer',
    path: 'src/index.ts',
    lineStart: 1,
    lineEnd: 10,
    url: null,
    selector: null,
    screenshotPath: null,
    snippet: 'const x = 1',
    maskedValue: null,
    metadata: null,
    createdAt: ISO,
    ...over,
  };
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createAuditRun', () => {
  it('POSTs to /api/audit-runs with JSON-stringified body', async () => {
    apiFetchMock.mockResolvedValue({
      auditRunId: 'run-1',
      projectId: 'proj-1',
      status: 'PENDING',
    });

    const { createAuditRun } = await import('./audit-runs');
    const out = await createAuditRun({
      repoUrl: 'https://github.com/owner/repo',
    });

    expect(out).toEqual({
      auditRunId: 'run-1',
      projectId: 'proj-1',
      status: 'PENDING',
    });
    expect(apiFetchMock).toHaveBeenCalledWith('/api/audit-runs', {
      method: 'POST',
      body: JSON.stringify({ repoUrl: 'https://github.com/owner/repo' }),
    });
  });

  it('forwards optional deployUrl and prdText in body', async () => {
    apiFetchMock.mockResolvedValue({
      auditRunId: 'run-2',
      projectId: 'proj-2',
      status: 'PENDING',
    });

    const { createAuditRun } = await import('./audit-runs');
    await createAuditRun({
      repoUrl: 'https://github.com/o/r',
      deployUrl: 'https://x.example',
      prdText: 'PRD body',
    });

    const [, init] = apiFetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      repoUrl: 'https://github.com/o/r',
      deployUrl: 'https://x.example',
      prdText: 'PRD body',
    });
  });

  it('propagates apiFetch errors', async () => {
    apiFetchMock.mockRejectedValue(new Error('boom'));
    const { createAuditRun } = await import('./audit-runs');
    await expect(
      createAuditRun({ repoUrl: 'https://github.com/o/r' }),
    ).rejects.toThrow('boom');
  });
});

describe('getAuditRun', () => {
  it('URL-encodes the id and parses response against AuditRunSchema', async () => {
    apiFetchMock.mockResolvedValue(sampleAuditRun());

    const { getAuditRun } = await import('./audit-runs');
    const out = await getAuditRun('run id/with slash');

    expect(apiFetchMock).toHaveBeenCalledWith(
      '/api/audit-runs/run%20id%2Fwith%20slash',
    );
    expect(out.id).toBe('run-1');
    expect(out.status).toBe('RUNNING');
    expect(out.progress).toBe(42);
  });

  it('throws when response fails schema validation', async () => {
    apiFetchMock.mockResolvedValue({ id: 'run-1' });
    const { getAuditRun } = await import('./audit-runs');
    await expect(getAuditRun('run-1')).rejects.toThrow();
  });
});

describe('cancelAuditRun', () => {
  it('POSTs to the cancel endpoint with encoded id', async () => {
    apiFetchMock.mockResolvedValue(undefined);

    const { cancelAuditRun } = await import('./audit-runs');
    await cancelAuditRun('run-1');

    expect(apiFetchMock).toHaveBeenCalledWith(
      '/api/audit-runs/run-1/cancel',
      { method: 'POST' },
    );
  });
});

describe('getReport', () => {
  it('parses an AuditReport response', async () => {
    apiFetchMock.mockResolvedValue({
      id: 'main',
      auditRunId: 'run-1',
      readinessScore: 75,
      launchStatus: 'CONDITIONAL',
      categoryScores: [],
      severityCounts: { P0: 0, P1: 1, P2: 2, P3: 3 },
      executiveSummary: 'summary',
      markdown: '# report',
      createdAt: ISO,
      updatedAt: ISO,
    });

    const { getReport } = await import('./audit-runs');
    const out = await getReport('run-1');

    expect(apiFetchMock).toHaveBeenCalledWith('/api/audit-runs/run-1/report');
    expect(out.readinessScore).toBe(75);
    expect(out.launchStatus).toBe('CONDITIONAL');
  });
});

describe('getFeatureGraph', () => {
  it('parses a FeatureGraph response', async () => {
    apiFetchMock.mockResolvedValue({
      id: 'main',
      auditRunId: 'run-1',
      nodes: [],
      edges: [],
      summary: null,
      createdAt: ISO,
      updatedAt: ISO,
    });

    const { getFeatureGraph } = await import('./audit-runs');
    const out = await getFeatureGraph('run-1');

    expect(apiFetchMock).toHaveBeenCalledWith(
      '/api/audit-runs/run-1/feature-graph',
    );
    expect(out.nodes).toEqual([]);
    expect(out.edges).toEqual([]);
  });
});

describe('getImprovementPrd', () => {
  it('parses an ImprovementPRD response', async () => {
    apiFetchMock.mockResolvedValue({
      id: 'main',
      auditRunId: 'run-1',
      title: 'Improvements',
      markdown: '# epics',
      epicCount: 3,
      createdAt: ISO,
      updatedAt: ISO,
    });

    const { getImprovementPrd } = await import('./audit-runs');
    const out = await getImprovementPrd('run-1');

    expect(apiFetchMock).toHaveBeenCalledWith(
      '/api/audit-runs/run-1/improvement-prd',
    );
    expect(out.epicCount).toBe(3);
  });
});

describe('listFindings', () => {
  it('builds URL without query params when none supplied', async () => {
    apiFetchMock.mockResolvedValue({ findings: [], nextCursor: null });

    const { listFindings } = await import('./audit-runs');
    await listFindings('run-1');

    expect(apiFetchMock).toHaveBeenCalledWith('/api/audit-runs/run-1/findings');
  });

  it('appends severity, category, limit, cursor when provided', async () => {
    apiFetchMock.mockResolvedValue({ findings: [], nextCursor: null });

    const { listFindings } = await import('./audit-runs');
    await listFindings('run-1', {
      severity: 'P1',
      category: 'SECURITY_PRIVACY',
      limit: 25,
      cursor: 'cur-abc',
    });

    const [url] = apiFetchMock.mock.calls[0];
    expect(url).toMatch(/^\/api\/audit-runs\/run-1\/findings\?/);
    const qs = new URLSearchParams(url.split('?')[1]);
    expect(qs.get('severity')).toBe('P1');
    expect(qs.get('category')).toBe('SECURITY_PRIVACY');
    expect(qs.get('limit')).toBe('25');
    expect(qs.get('cursor')).toBe('cur-abc');
  });

  it('parses findings array against schema', async () => {
    apiFetchMock.mockResolvedValue({
      findings: [sampleFinding(), sampleFinding({ id: 'f-2' })],
      nextCursor: 'next',
    });

    const { listFindings } = await import('./audit-runs');
    const out = await listFindings('run-1');

    expect(out.findings).toHaveLength(2);
    expect(out.nextCursor).toBe('next');
  });
});

describe('getFinding', () => {
  it('builds /api/findings/:id?runId=... and parses response', async () => {
    apiFetchMock.mockResolvedValue({
      finding: sampleFinding(),
      evidences: [sampleEvidence()],
    });

    const { getFinding } = await import('./audit-runs');
    const out = await getFinding('f-1', 'run-1');

    expect(apiFetchMock).toHaveBeenCalledWith(
      '/api/findings/f-1?runId=run-1',
    );
    expect(out.finding.id).toBe('f-1');
    expect(out.evidences).toHaveLength(1);
  });

  it('URL-encodes findingId and runId', async () => {
    apiFetchMock.mockResolvedValue({
      finding: sampleFinding(),
      evidences: [],
    });

    const { getFinding } = await import('./audit-runs');
    await getFinding('f/1', 'run id');

    expect(apiFetchMock).toHaveBeenCalledWith(
      '/api/findings/f%2F1?runId=run%20id',
    );
  });
});
