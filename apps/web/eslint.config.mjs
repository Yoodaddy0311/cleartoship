// Flat config for apps/web. Wraps the legacy `eslint-config-next` shareable
// config (still .eslintrc-style in next 15.x) via FlatCompat so we can drop
// `next lint` (deprecated in Next.js 16) and run `eslint .` directly. Mirrors
// the rule set previously declared in .eslintrc.json.
import { FlatCompat } from '@eslint/eslintrc';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: __dirname,
});

const config = [
  ...compat.extends('next/core-web-vitals'),
  ...compat.plugins('vitest', '@typescript-eslint'),
  {
    rules: {
      'vitest/no-disabled-tests': 'error',
      'vitest/no-focused-tests': 'error',
      'vitest/expect-expect': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'vitest/no-disabled-tests': 'error',
    },
  },
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'dist/**',
      'next-env.d.ts',
      'playwright-report/**',
      'test-results/**',
    ],
  },
];

export default config;
