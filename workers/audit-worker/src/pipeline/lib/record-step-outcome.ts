import type { AuditStep } from '@cleartoship/shared-types';
import type { PipelineState } from '../steps/index.js';

/**
 * Outcome of a pipeline step's primary work:
 *   CHECKPOINT — step ran successfully end-to-end; marks the step as
 *                executed so the scorer can include its signals.
 *   SKIPPED    — step early-returned (missing precondition, tool absent, etc.)
 *                and did NOT produce measurement signals.
 *   FAILED     — step encountered an error but was recovered; signals are
 *                unreliable and the step should not count as measured.
 *
 * Only CHECKPOINT pushes to state.executedSteps (BUG-1 invariant).
 */
export type StepOutcome = 'CHECKPOINT' | 'SKIPPED' | 'FAILED';

/**
 * Records the outcome of a pipeline step.
 * CHECKPOINT is the only outcome that appends to state.executedSteps,
 * preserving the BUG-1 invariant: a skipped or failed step must not
 * contribute to the scorer's measuredBy coverage table.
 */
export function recordStepOutcome(
  state: PipelineState,
  stepId: AuditStep,
  outcome: StepOutcome,
): void {
  if (outcome === 'CHECKPOINT') {
    state.executedSteps.push(stepId);
  }
}
