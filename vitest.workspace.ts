import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  './apps/web/vitest.config.ts',
  './functions/vitest.config.ts',
  './workers/audit-worker/vitest.config.ts',
  './workers/enrichment-worker/vitest.config.ts',
]);
