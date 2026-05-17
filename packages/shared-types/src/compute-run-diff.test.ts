// Behavioural tests for computeRunDiff. Pure function — no mocks needed.
// Asserts the contract documented in T2.5:
//   - finding ID is the default match key → added/removed are partitioned
//   - same id + different evidence/severity/etc → "changed" with the
//     changedFields list naming WHICH fields drifted
//   - score delta is null when either side is N/A (never falls back to 0)
//   - severity counts always materialize for all four P-levels
//   - category list is sorted deterministically

import { describe, it, expect } from 'vitest';
import { computeRunDiff } from './compute-run-diff.js';
import type { AuditReport, Finding } from './domain.js';

function makeFinding(overrides: Partial<Finding> & { id: string }): Finding {
  return {
    id: overrides.id,
    auditRunId: overrides.auditRunId ?? 'run-prev',
    title: overrides.title ?? 'Sample finding',
    category: overrides.category ?? 'SECURITY_PRIVACY',
    severity: overrides.severity ?? 'P1',
    confidence: overrides.confidence ?? 'HIGH',
    status: overrides.status ?? 'OPEN',
    summary: overrides.summary ?? 'summary',
    nonDeveloperExplanation: overrides.nonDeveloperExplanation ?? null,
    technicalExplanation: overrides.technicalExplanation ?? null,
    impact: overrides.impact ?? null,
    recommendation: overrides.recommendation ?? null,
    acceptanceCriteria: overrides.acceptanceCriteria ?? [],
    tags: overrides.tags ?? [],
    evidenceCount: overrides.evidenceCount ?? 1,
    createdAt: overrides.createdAt ?? '2026-05-17T00:00:00.000Z',
  };
}

function makeReport(overrides: Partial<AuditReport>): AuditReport {
  return {
    id: 'main',
    auditRunId: overrides.auditRunId ?? 'run-x',
    readinessScore: overrides.readinessScore ?? 70,
    launchStatus: overrides.launchStatus ?? 'CONDITIONAL',
    categoryScores: overrides.categoryScores ?? [],
    severityCounts: overrides.severityCounts ?? { P0: 0, P1: 0, P2: 0, P3: 0 },
    executiveSummary: overrides.executiveSummary ?? '',
    markdown: overrides.markdown ?? '',
    createdAt: overrides.createdAt ?? '2026-05-17T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-05-17T00:00:00.000Z',
  };
}

describe('computeRunDiff — finding classification', () => {
  it('classifies a finding present only in current as "added"', () => {
    const diff = computeRunDiff({
      previousRunId: 'r0',
      currentRunId: 'r1',
      previousReport: null,
      currentReport: null,
      previousFindings: [],
      currentFindings: [makeFinding({ id: 'f-new' })],
    });
    expect(diff.totals.added).toBe(1);
    expect(diff.totals.removed).toBe(0);
    expect(diff.totals.changed).toBe(0);
    expect(diff.findingChanges).toHaveLength(1);
    expect(diff.findingChanges[0]?.kind).toBe('added');
    expect(diff.findingChanges[0]?.current?.id).toBe('f-new');
    expect(diff.findingChanges[0]?.previous).toBeNull();
  });

  it('classifies a finding present only in previous as "removed"', () => {
    const diff = computeRunDiff({
      previousRunId: 'r0',
      currentRunId: 'r1',
      previousReport: null,
      currentReport: null,
      previousFindings: [makeFinding({ id: 'f-gone' })],
      currentFindings: [],
    });
    expect(diff.totals.removed).toBe(1);
    expect(diff.findingChanges[0]?.kind).toBe('removed');
    expect(diff.findingChanges[0]?.previous?.id).toBe('f-gone');
    expect(diff.findingChanges[0]?.current).toBeNull();
  });

  it('classifies a same-id finding with shifted severity as "changed"', () => {
    const prev = makeFinding({ id: 'f-shift', severity: 'P2', evidenceCount: 1 });
    const curr = makeFinding({ id: 'f-shift', severity: 'P0', evidenceCount: 3 });
    const diff = computeRunDiff({
      previousRunId: 'r0',
      currentRunId: 'r1',
      previousReport: null,
      currentReport: null,
      previousFindings: [prev],
      currentFindings: [curr],
    });
    expect(diff.totals.changed).toBe(1);
    const change = diff.findingChanges[0];
    expect(change?.kind).toBe('changed');
    expect(change?.changedFields).toContain('severity');
    expect(change?.changedFields).toContain('evidenceCount');
  });

  it('classifies an identical finding as unchanged (not in the changes list)', () => {
    const f = makeFinding({ id: 'f-same' });
    const diff = computeRunDiff({
      previousRunId: 'r0',
      currentRunId: 'r1',
      previousReport: null,
      currentReport: null,
      previousFindings: [f],
      currentFindings: [f],
    });
    expect(diff.totals.unchanged).toBe(1);
    expect(diff.findingChanges).toHaveLength(0);
  });

  it('uses a custom matchKeyOf when provided (renamed id != added+removed)', () => {
    const prev = makeFinding({ id: 'firestore-id-A', title: 'XSS in /search' });
    const curr = makeFinding({ id: 'firestore-id-B', title: 'XSS in /search' });
    const diff = computeRunDiff({
      previousRunId: 'r0',
      currentRunId: 'r1',
      previousReport: null,
      currentReport: null,
      previousFindings: [prev],
      currentFindings: [curr],
      matchKeyOf: (f) => f.title,
    });
    // Same title → matched as unchanged (id field is not in COMPARED_FIELDS).
    expect(diff.totals.added).toBe(0);
    expect(diff.totals.removed).toBe(0);
    expect(diff.totals.unchanged).toBe(1);
  });

  it('deduplicates duplicate ids on each side (first write wins)', () => {
    const a = makeFinding({ id: 'dup', severity: 'P0' });
    const b = makeFinding({ id: 'dup', severity: 'P3' });
    const diff = computeRunDiff({
      previousRunId: 'r0',
      currentRunId: 'r1',
      previousReport: null,
      currentReport: null,
      previousFindings: [a, b],
      currentFindings: [a, b],
    });
    expect(diff.findingChanges).toHaveLength(0);
    expect(diff.totals.unchanged).toBe(1);
  });
});

describe('computeRunDiff — score deltas', () => {
  it('computes scoreDelta when both sides report a numeric score', () => {
    const diff = computeRunDiff({
      previousRunId: 'r0',
      currentRunId: 'r1',
      previousReport: makeReport({ readinessScore: 60 }),
      currentReport: makeReport({ readinessScore: 75 }),
      previousFindings: [],
      currentFindings: [],
    });
    expect(diff.scoreDelta).toBe(15);
    expect(diff.previousScore).toBe(60);
    expect(diff.currentScore).toBe(75);
  });

  it('returns null scoreDelta when previousReport is missing', () => {
    const diff = computeRunDiff({
      previousRunId: 'r0',
      currentRunId: 'r1',
      previousReport: null,
      currentReport: makeReport({ readinessScore: 75 }),
      previousFindings: [],
      currentFindings: [],
    });
    expect(diff.scoreDelta).toBeNull();
    expect(diff.currentScore).toBe(75);
    expect(diff.previousScore).toBeNull();
  });

  it('returns null scoreDelta when currentReport is missing', () => {
    const diff = computeRunDiff({
      previousRunId: 'r0',
      currentRunId: 'r1',
      previousReport: makeReport({ readinessScore: 60 }),
      currentReport: null,
      previousFindings: [],
      currentFindings: [],
    });
    expect(diff.scoreDelta).toBeNull();
  });
});

describe('computeRunDiff — category deltas', () => {
  it('emits one delta per category present on either side, sorted by enum', () => {
    const prev = makeReport({
      categoryScores: [
        { category: 'SECURITY_PRIVACY', label: 'Security', score: 50, summary: null },
        { category: 'FRONTEND_CODE', label: 'Frontend', score: 70, summary: null },
      ],
    });
    const curr = makeReport({
      categoryScores: [
        { category: 'SECURITY_PRIVACY', label: 'Security', score: 80, summary: null },
        { category: 'BACKEND_API', label: 'Backend', score: 65, summary: null },
      ],
    });
    const diff = computeRunDiff({
      previousRunId: 'r0',
      currentRunId: 'r1',
      previousReport: prev,
      currentReport: curr,
      previousFindings: [],
      currentFindings: [],
    });
    expect(diff.categoryDeltas.map((d) => d.category)).toEqual([
      'BACKEND_API',
      'FRONTEND_CODE',
      'SECURITY_PRIVACY',
    ]);
    const security = diff.categoryDeltas.find((d) => d.category === 'SECURITY_PRIVACY')!;
    expect(security.delta).toBe(30);
    // Categories only in current have a null previous score.
    const backend = diff.categoryDeltas.find((d) => d.category === 'BACKEND_API')!;
    expect(backend.previous).toBeNull();
    expect(backend.delta).toBeNull();
    // Categories only in previous have a null current score.
    const frontend = diff.categoryDeltas.find((d) => d.category === 'FRONTEND_CODE')!;
    expect(frontend.current).toBeNull();
    expect(frontend.delta).toBeNull();
  });

  it('treats N/A (null) category scores as non-numeric — delta stays null', () => {
    const prev = makeReport({
      categoryScores: [{ category: 'UX_UI', label: 'UX', score: null, summary: null }],
    });
    const curr = makeReport({
      categoryScores: [{ category: 'UX_UI', label: 'UX', score: 90, summary: null }],
    });
    const diff = computeRunDiff({
      previousRunId: 'r0',
      currentRunId: 'r1',
      previousReport: prev,
      currentReport: curr,
      previousFindings: [],
      currentFindings: [],
    });
    expect(diff.categoryDeltas[0]?.previous).toBeNull();
    expect(diff.categoryDeltas[0]?.current).toBe(90);
    expect(diff.categoryDeltas[0]?.delta).toBeNull();
  });
});

describe('computeRunDiff — severity deltas', () => {
  it('always emits exactly P0..P3 in fixed order', () => {
    const diff = computeRunDiff({
      previousRunId: 'r0',
      currentRunId: 'r1',
      previousReport: makeReport({ severityCounts: { P0: 1, P1: 2, P2: 3, P3: 4 } }),
      currentReport: makeReport({ severityCounts: { P0: 0, P1: 4, P2: 3, P3: 2 } }),
      previousFindings: [],
      currentFindings: [],
    });
    expect(diff.severityDeltas.map((d) => d.severity)).toEqual(['P0', 'P1', 'P2', 'P3']);
    const p0 = diff.severityDeltas[0]!;
    expect(p0.delta).toBe(-1);
    const p1 = diff.severityDeltas[1]!;
    expect(p1.delta).toBe(2);
  });

  it('treats missing reports as zero counts on that side', () => {
    const diff = computeRunDiff({
      previousRunId: 'r0',
      currentRunId: 'r1',
      previousReport: null,
      currentReport: makeReport({ severityCounts: { P0: 5, P1: 0, P2: 0, P3: 0 } }),
      previousFindings: [],
      currentFindings: [],
    });
    expect(diff.severityDeltas[0]?.previous).toBe(0);
    expect(diff.severityDeltas[0]?.current).toBe(5);
    expect(diff.severityDeltas[0]?.delta).toBe(5);
  });
});

describe('computeRunDiff — totals', () => {
  it('totals = added + removed + changed + unchanged', () => {
    const prev = [
      makeFinding({ id: 'a' }),
      makeFinding({ id: 'b', severity: 'P1' }),
      makeFinding({ id: 'c' }),
      makeFinding({ id: 'd-gone' }),
    ];
    const curr = [
      makeFinding({ id: 'a' }), // unchanged
      makeFinding({ id: 'b', severity: 'P0' }), // changed
      makeFinding({ id: 'c' }), // unchanged
      makeFinding({ id: 'e-new' }), // added
    ];
    const diff = computeRunDiff({
      previousRunId: 'r0',
      currentRunId: 'r1',
      previousReport: null,
      currentReport: null,
      previousFindings: prev,
      currentFindings: curr,
    });
    expect(diff.totals).toEqual({ added: 1, removed: 1, changed: 1, unchanged: 2 });
  });
});
