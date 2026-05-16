// Domain schema tests — focused on the EnqueueMode + AuditRun.enqueueMode
// contract that's the runtime → persisted dispatch-route record.
//
// The MVP needs this guard because:
//   - apps/web/lib/audit-runs/create-audit-run.ts persists `enqueueMode` and
//     downstream readers (AuditRunDto, DevPipelineBanner) treat it as the
//     single source of truth for "which path did this audit take?".
//   - apps/web/lib/cloud-tasks/enqueue.ts re-exports the type, so any drift
//     in the literal set silently breaks every consumer.
//
// Sibling-located on purpose: the review-gate hook only treats `<name>.test.ts`
// adjacent to `<name>.ts` as proof-of-coverage. Tests under `__tests__/` are
// fine for vitest but invisible to the gate.

import { describe, it, expect } from 'vitest';
import { EnqueueModeSchema, AuditRunSchema } from './domain.js';

const ISO = '2026-05-16T05:00:00.000Z';

function baseAuditRun(over: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    projectId: 'proj-1',
    ownerId: 'user-1',
    status: 'RUNNING',
    currentStep: 'RUN_STATIC_ANALYSIS',
    progress: 42,
    commitHash: null,
    startedAt: null,
    completedAt: null,
    errorMessage: null,
    repoUrl: 'https://github.com/owner/repo',
    deployUrl: null,
    prdText: null,
    enqueueMode: 'cloud-tasks',
    createdAt: ISO,
    updatedAt: ISO,
    ...over,
  };
}

describe('EnqueueModeSchema', () => {
  it('accepts exactly the three documented literals', () => {
    expect(EnqueueModeSchema.options).toEqual([
      'cloud-tasks',
      'direct-worker',
      'stub',
    ]);
  });

  it.each(['cloud-tasks', 'direct-worker', 'stub'] as const)(
    'parses %s',
    (value) => {
      expect(EnqueueModeSchema.parse(value)).toBe(value);
    }
  );

  it('rejects unknown enqueue paths with a zod error', () => {
    const result = EnqueueModeSchema.safeParse('http');
    expect(result.success).toBe(false);
  });

  it('rejects null (use AuditRunSchema.enqueueMode wrapper for null)', () => {
    const result = EnqueueModeSchema.safeParse(null);
    expect(result.success).toBe(false);
  });
});

describe('AuditRunSchema.enqueueMode field', () => {
  it('accepts null — pre-enqueue state (initial Firestore write)', () => {
    const parsed = AuditRunSchema.parse(baseAuditRun({ enqueueMode: null }));
    expect(parsed.enqueueMode).toBeNull();
  });

  it.each(['cloud-tasks', 'direct-worker', 'stub'] as const)(
    'accepts %s as a post-enqueue value',
    (mode) => {
      const parsed = AuditRunSchema.parse(baseAuditRun({ enqueueMode: mode }));
      expect(parsed.enqueueMode).toBe(mode);
    }
  );

  it('rejects an audit-run with an unknown enqueueMode literal', () => {
    const result = AuditRunSchema.safeParse(
      baseAuditRun({ enqueueMode: 'direct' })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('enqueueMode');
    }
  });

  it('accepts an audit-run missing the enqueueMode key (legacy doc forward-compat)', () => {
    const { enqueueMode: _drop, ...withoutMode } = baseAuditRun();
    const result = AuditRunSchema.safeParse(withoutMode);
    // Legacy documents written before this field existed have the key
    // missing entirely. The schema is `.nullable().optional()` so a missing
    // key parses to `undefined`; the Firestore converter normalizes that to
    // `null` at the read boundary so downstream consumers always see
    // `EnqueueMode | null`, never `undefined`.
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enqueueMode).toBeUndefined();
    }
  });
});
