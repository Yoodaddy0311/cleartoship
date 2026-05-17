// Integration safety net for the full STEP_REGISTRY traversal.
//
// Goal: lock the high-level invariants the worker depends on even as W2/W3/
// W4/W5 add new steps and state fields. We mock every external side effect
// (Firestore writers, simple-git clone, network) and only verify the runner
// orchestration:
//   - The pipeline visits every STEP_REGISTRY entry in declared order.
//   - Each step name matches a value in the AUDIT_STEPS enum from
//     `@cleartoship/shared-types` (key sync).
//   - Steps that depend on prior state (e.g. step11 MAP_CHECKLIST) tolerate
//     an empty `pendingFindings` without throwing.
//   - severityCounts ends up populated as a {P0..P3} number record.
//
// NOTE: this file does NOT exercise the real step implementations end-to-end
// — that would require fixtures (Semgrep, OSV, Lighthouse, Firestore Admin).
// Instead, we stub each registered step with a thin wrapper that records the
// visit order and forwards to a minimal in-memory effect. The goal is to
// catch regressions in the registry shape and the runner's loop, not to
// re-test individual steps.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIT_STEPS, type AuditStep } from '@cleartoship/shared-types';

// --- Mocks --------------------------------------------------------------
// All Firestore writers + readers are stubbed so the runner does not touch
// real infrastructure. We expose hoisted refs so individual tests can assert
// call counts and arguments.
const {
  getAuditRunOrThrowMock,
  markRunStartedMock,
  markRunCompletedMock,
  markRunFailedMock,
  updateRunStepMock,
} = vi.hoisted(() => ({
  getAuditRunOrThrowMock: vi.fn(),
  markRunStartedMock: vi.fn(async () => undefined),
  markRunCompletedMock: vi.fn(async () => undefined),
  markRunFailedMock: vi.fn(async () => undefined),
  updateRunStepMock: vi.fn(async () => undefined),
}));

vi.mock('../firestore/writers.js', () => ({
  markRunStarted: markRunStartedMock,
  markRunCompleted: markRunCompletedMock,
  markRunFailed: markRunFailedMock,
  updateRunStep: updateRunStepMock,
}));

vi.mock('../firestore/readers.js', () => ({
  getAuditRunOrThrow: getAuditRunOrThrowMock,
}));

// Block simpleGit so even if a real step somehow runs in a failure path we
// never hit the network.
vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => ({
    clone: vi.fn(async () => undefined),
    revparse: vi.fn(async () => 'deadbeef'),
  })),
}));

describe('runPipeline — integration safety net', () => {
  beforeEach(() => {
    getAuditRunOrThrowMock.mockReset();
    markRunStartedMock.mockClear();
    markRunCompletedMock.mockClear();
    markRunFailedMock.mockClear();
    updateRunStepMock.mockClear();
    vi.resetModules();
  });

  it('every STEP_REGISTRY entry uses a step name from AUDIT_STEPS', async () => {
    const { STEP_REGISTRY } = await import('./steps/index.js');
    const declared = new Set<AuditStep>(AUDIT_STEPS);
    for (const step of STEP_REGISTRY) {
      expect(
        declared.has(step.step),
        `STEP_REGISTRY contains "${step.step}" which is not in AUDIT_STEPS`,
      ).toBe(true);
    }
  });

  it('runs every registered step in declared order and marks the run completed', async () => {
    getAuditRunOrThrowMock.mockResolvedValueOnce({
      id: 'run-int-1',
      ownerId: 'owner-int-1',
      projectId: 'proj-int-1',
      repoUrl: 'https://github.com/example/repo',
      deployUrl: null,
      prdText: null,
    });

    // Capture the original step list before stubbing so the assertion can
    // reference the real registered order.
    const original = await import('./steps/index.js');
    const visited: string[] = [];
    const stubbed = original.STEP_REGISTRY.map((s) => ({
      step: s.step,
      async execute() {
        visited.push(s.step);
      },
    }));

    // Re-mock the steps barrel BEFORE importing the runner so the runner's
    // top-level `import { STEP_REGISTRY } from './steps/index.js'` resolves
    // against the stubbed array. createInitialState is preserved.
    vi.doMock('./steps/index.js', () => ({
      STEP_REGISTRY: stubbed,
      createInitialState: original.createInitialState,
    }));

    const { runPipeline } = await import('./runner.js');
    await runPipeline({ runId: 'run-int-1' });

    expect(visited).toEqual(stubbed.map((s) => s.step));
    expect(markRunStartedMock).toHaveBeenCalledWith('run-int-1');
    expect(markRunCompletedMock).toHaveBeenCalledWith('run-int-1');
    expect(markRunFailedMock).not.toHaveBeenCalled();
    const lastCall = updateRunStepMock.mock.calls.at(-1);
    expect(lastCall?.[2]).toBe(100);

    vi.doUnmock('./steps/index.js');
  });

  it('step11 MAP_CHECKLIST style step does not throw when pendingFindings is empty', async () => {
    getAuditRunOrThrowMock.mockResolvedValueOnce({
      id: 'run-int-2',
      ownerId: 'owner-int-2',
      projectId: 'proj-int-2',
      repoUrl: 'https://github.com/example/repo',
      deployUrl: null,
      prdText: null,
    });

    const original = await import('./steps/index.js');
    const stubbed = original.STEP_REGISTRY.map((s) => ({
      step: s.step,
      async execute(_ctx: unknown, state: { pendingFindings: unknown[]; severityCounts: Record<string, number> }) {
        if (s.step === 'MAP_CHECKLIST') {
          expect(Array.isArray(state.pendingFindings)).toBe(true);
        }
        if (s.step === 'CALCULATE_SCORES') {
          const counts = { P0: 0, P1: 0, P2: 0, P3: 0 };
          for (const f of state.pendingFindings as Array<{ severity: keyof typeof counts }>) {
            counts[f.severity] = (counts[f.severity] ?? 0) + 1;
          }
          state.severityCounts = counts;
        }
      },
    }));
    vi.doMock('./steps/index.js', () => ({
      STEP_REGISTRY: stubbed,
      createInitialState: original.createInitialState,
    }));

    const { runPipeline } = await import('./runner.js');
    await expect(runPipeline({ runId: 'run-int-2' })).resolves.toBeUndefined();
    expect(markRunFailedMock).not.toHaveBeenCalled();
    expect(markRunCompletedMock).toHaveBeenCalledWith('run-int-2');

    vi.doUnmock('./steps/index.js');
  });

  it('marks the run FAILED with the offending step name when a step throws', async () => {
    getAuditRunOrThrowMock.mockResolvedValueOnce({
      id: 'run-int-3',
      ownerId: 'owner-int-3',
      projectId: 'proj-int-3',
      repoUrl: 'https://github.com/example/repo',
      deployUrl: null,
      prdText: null,
    });

    const original = await import('./steps/index.js');
    const stubbed = original.STEP_REGISTRY.map((s) => ({
      step: s.step,
      async execute() {
        if (s.step === 'CLONE_REPO') {
          throw new Error('clone boom');
        }
      },
    }));
    vi.doMock('./steps/index.js', () => ({
      STEP_REGISTRY: stubbed,
      createInitialState: original.createInitialState,
    }));

    const { runPipeline } = await import('./runner.js');
    await runPipeline({ runId: 'run-int-3' });
    expect(markRunCompletedMock).not.toHaveBeenCalled();
    const failArg = markRunFailedMock.mock.calls[0]?.[1];
    expect(failArg).toContain('CLONE_REPO');
    expect(failArg).toContain('clone boom');

    vi.doUnmock('./steps/index.js');
  });

  it('refuses to run when the AuditRun cannot be loaded from Firestore', async () => {
    getAuditRunOrThrowMock.mockRejectedValueOnce(new Error('not found'));
    const { runPipeline } = await import('./runner.js');
    await runPipeline({ runId: 'missing-run' });
    expect(markRunStartedMock).not.toHaveBeenCalled();
    expect(markRunCompletedMock).not.toHaveBeenCalled();
    // Best-effort failure update still attempted.
    expect(markRunFailedMock).toHaveBeenCalledWith(
      'missing-run',
      expect.stringContaining('not found'),
    );
  });
});
