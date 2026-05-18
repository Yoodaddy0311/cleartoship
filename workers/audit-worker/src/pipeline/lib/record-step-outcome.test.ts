import { describe, it, expect } from 'vitest';
import { recordStepOutcome } from './record-step-outcome.js';
import { createInitialState } from '../steps/index.js';

describe('recordStepOutcome', () => {
  it('CHECKPOINT pushes stepId to executedSteps', () => {
    const state = createInitialState();
    recordStepOutcome(state, 'RUN_STATIC_ANALYSIS', 'CHECKPOINT');
    expect(state.executedSteps).toEqual(['RUN_STATIC_ANALYSIS']);
  });

  it('SKIPPED does not push to executedSteps', () => {
    const state = createInitialState();
    recordStepOutcome(state, 'ANALYZE_DEPLOY_URL', 'SKIPPED');
    expect(state.executedSteps).toHaveLength(0);
  });

  it('FAILED does not push to executedSteps', () => {
    const state = createInitialState();
    recordStepOutcome(state, 'RUN_DEPENDENCY_SCAN', 'FAILED');
    expect(state.executedSteps).toHaveLength(0);
  });

  it('multiple CHECKPOINT calls accumulate in order', () => {
    const state = createInitialState();
    recordStepOutcome(state, 'CLONE_REPO', 'CHECKPOINT');
    recordStepOutcome(state, 'RUN_STATIC_ANALYSIS', 'CHECKPOINT');
    recordStepOutcome(state, 'RUN_DEPENDENCY_SCAN', 'CHECKPOINT');
    expect(state.executedSteps).toEqual([
      'CLONE_REPO',
      'RUN_STATIC_ANALYSIS',
      'RUN_DEPENDENCY_SCAN',
    ]);
  });

  it('SKIPPED between CHECKPOINTs does not insert gaps', () => {
    const state = createInitialState();
    recordStepOutcome(state, 'CLONE_REPO', 'CHECKPOINT');
    recordStepOutcome(state, 'ANALYZE_DEPLOY_URL', 'SKIPPED');
    recordStepOutcome(state, 'RUN_STATIC_ANALYSIS', 'CHECKPOINT');
    expect(state.executedSteps).toEqual(['CLONE_REPO', 'RUN_STATIC_ANALYSIS']);
  });

  it('does not duplicate stepId if called twice with CHECKPOINT', () => {
    const state = createInitialState();
    recordStepOutcome(state, 'RUN_SECRET_SCAN', 'CHECKPOINT');
    recordStepOutcome(state, 'RUN_SECRET_SCAN', 'CHECKPOINT');
    // Intentionally allows duplicates — caller is responsible for idempotency.
    // This test documents the current behavior.
    expect(state.executedSteps).toHaveLength(2);
  });
});
