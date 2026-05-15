import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts', 'lib/**/*.test.tsx'],
    environment: 'node',
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
      '@cleartoship/audit-core': path.resolve(__dirname, '../../packages/audit-core/src/index.ts'),
      '@cleartoship/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
      '@': path.resolve(__dirname, '.'),
    },
  },
});
