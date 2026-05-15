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
      '@cleartoship/audit-core': path.resolve(__dirname, '../../packages/audit-core/src/index.ts'),
    },
  },
});
