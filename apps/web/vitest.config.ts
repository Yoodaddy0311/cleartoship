import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  // tsconfig sets `jsx: preserve` for Next.js, but vitest's esbuild needs an
  // explicit transform. `automatic` matches React 18's new JSX runtime, so
  // test files don't need an `import React` line.
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    include: [
      '*.test.ts',
      '*.test.tsx',
      'lib/**/*.test.ts',
      'lib/**/*.test.tsx',
      'app/**/*.test.ts',
      'app/**/*.test.tsx',
      'components/**/*.test.ts',
      'components/**/*.test.tsx',
      'e2e/fixtures/**/*.test.ts',
    ],
    environment: 'node',
    environmentMatchGlobs: [
      ['**/*.test.tsx', 'jsdom'],
      ['components/**/*.test.ts', 'jsdom'],
    ],
    setupFiles: ['./vitest.setup.ts'],
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['lib/**/*.ts'],
      exclude: ['lib/**/*.test.ts'],
      reportsDirectory: './coverage',
    },
  },
  resolve: {
    alias: {
      '@cleartoship/shared-types': path.resolve(__dirname, '../../packages/shared-types/src/index.ts'),
      // Subpath alias MUST precede the barrel alias (rollup-alias matches in
      // order). The dashboard deep-imports this pure module to avoid pulling
      // the node-only barrel into the client bundle (next build); vitest needs
      // the same subpath to resolve to src instead of `index.ts/scoring/...`.
      '@cleartoship/audit-core/scoring/apply-enrichment': path.resolve(
        __dirname,
        '../../packages/audit-core/src/scoring/apply-enrichment.ts',
      ),
      '@cleartoship/audit-core': path.resolve(__dirname, '../../packages/audit-core/src/index.ts'),
      '@cleartoship/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
      '@': path.resolve(__dirname, '.'),
    },
  },
});
