import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      // Sprint 0 scope: scoring + improvement-prd only.
      // feature-graph and report are tracked for Sprint 1 (see test report gap).
      include: [
        'src/scoring/**/*.ts',
        'src/improvement-prd/**/*.ts',
      ],
      exclude: ['src/**/*.test.ts'],
      reportsDirectory: './coverage',
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@cleartoship/shared-types': path.resolve(here, '../shared-types/src/index.ts'),
    },
  },
});
