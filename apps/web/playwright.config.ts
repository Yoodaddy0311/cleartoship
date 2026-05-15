import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for apps/web E2E tests.
 *
 * Defaults are tuned for Sprint 0:
 *   - baseURL: http://localhost:3000 (Next.js dev server, overridable via E2E_BASE_URL)
 *   - webServer auto-starts `pnpm dev` unless E2E_NO_WEBSERVER=1
 *   - Firebase public env vars come from the developer's local .env.local
 *     (Next.js loads it automatically) or from CI secrets. We never embed
 *     them in this config — the client SDK is also fully stubbed per-spec
 *     via `page.route()` so a real project is not required.
 *
 * Cross-browser: Chromium is the default lane. Firefox + WebKit + Mobile
 * Chrome are enabled for nightly/regression runs (gated by E2E_FULL_MATRIX=1).
 */

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const RUN_FULL_MATRIX = process.env.E2E_FULL_MATRIX === '1';
const SKIP_WEBSERVER = process.env.E2E_NO_WEBSERVER === '1';

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts$/,
  outputDir: './e2e/.artifacts',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [
        ['list'],
        ['junit', { outputFile: 'e2e/.artifacts/junit.xml' }],
        ['html', { outputFolder: 'e2e/.artifacts/html', open: 'never' }],
      ]
    : [['list'], ['html', { outputFolder: 'e2e/.artifacts/html', open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    ...(RUN_FULL_MATRIX
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
          { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
        ]
      : []),
  ],

  webServer: SKIP_WEBSERVER
    ? undefined
    : {
        // pnpm filter avoids cwd issues when running from monorepo root.
        command: 'pnpm --filter web dev',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        // Inherit the developer's NEXT_PUBLIC_FIREBASE_* env (loaded from
        // .env.local by Next.js) or the CI secret store. Do not hardcode
        // values here — every Firebase call is intercepted by Playwright's
        // page.route() in each spec, so the dev server only needs the SDK
        // to initialise (any well-formed values from .env.local suffice).
      },
});
