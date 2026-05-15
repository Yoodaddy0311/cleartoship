import type { Step } from './index.js';

/**
 * Cleanup — Sprint 1 will rm -rf the /tmp/clone-{runId} tmpfs path. Sprint 0
 * has no clone path so this just resets in-memory state.
 */
export const step15Cleanup: Step = {
  step: 'CLEANUP',
  async execute(ctx, state) {
    state.pendingFindings = [];
    state.detectedFeatures = [];
    state.fileTree = [];
    ctx.log('info', 'Cleanup complete');
  },
};
