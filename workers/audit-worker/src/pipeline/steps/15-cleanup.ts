import { promises as fsp } from 'node:fs';
import type { Step } from './index.js';

/**
 * Cleanup — rm -rf the per-run tmp clone path and reset in-memory state.
 * Safe to call multiple times; missing path is silently ignored.
 */
export const step15Cleanup: Step = {
  step: 'CLEANUP',
  async execute(ctx, state) {
    if (ctx.clonePath) {
      try {
        await fsp.rm(ctx.clonePath, { recursive: true, force: true });
      } catch (e) {
        ctx.log('warn', 'Cleanup of clone path failed', {
          path: ctx.clonePath,
          error: (e as Error).message,
        });
      }
      ctx.clonePath = null;
    }
    state.pendingFindings = [];
    state.detectedFeatures = [];
    state.fileTree = [];
    ctx.log('info', 'Cleanup complete');
  },
};
