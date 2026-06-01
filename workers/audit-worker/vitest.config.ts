import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/server.ts'],
      reportsDirectory: './coverage',
    },
  },
  resolve: {
    alias: {
      '@cleartoship/shared-types': path.resolve(__dirname, '../../packages/shared-types/src/index.ts'),
      // Subpath alias MUST precede the barrel alias (rollup-alias matches in
      // order). step10 deep-imports this node-only module via the dedicated
      // subpath export to keep node:fs/path out of the audit-core barrel;
      // vitest needs the same subpath to resolve to src instead of
      // `index.ts/feature-graph/...`. Mirrors apps/web/vitest.config.ts.
      '@cleartoship/audit-core/feature-graph/edge-extract/assemble-detected': path.resolve(
        __dirname,
        '../../packages/audit-core/src/feature-graph/edge-extract/assemble-detected.ts',
      ),
      '@cleartoship/audit-core': path.resolve(__dirname, '../../packages/audit-core/src/index.ts'),
    },
  },
});
