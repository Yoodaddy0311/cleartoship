import { test, expect } from '@playwright/test';
import { AuditFlowPage } from './pages/AuditFlowPage';

/**
 * Sprint 5-01 — Live Golden Path E2E.
 *
 * Unlike `golden-path.spec.ts` (which fully stubs Firebase Auth + the audit
 * API surface), this spec exercises the REAL pipeline:
 *
 *   Web (Next.js dev @ :3100)
 *     → Firebase Auth Emulator  (anonymous sign-in)
 *     → POST /api/audit-runs    (creates Firestore doc + enqueues task)
 *     → Worker / Cloud Functions (18-step audit pipeline)
 *     → GET  /api/audit-runs/:id (polled until status=COMPLETED)
 *     → Dashboard render
 *
 * Stability contract:
 *   - `domcontentloaded` only — `networkidle` is forbidden because the
 *     polling hook keeps the network busy until redirect.
 *   - 5xx on POST /api/audit-runs or any polling GET => fail-fast.
 *   - Degraded environments (missing semgrep/osv/lighthouse on the runner)
 *     are tolerated: only `status: completed` and dashboard render are
 *     asserted. Finding counts / scores are NOT verified.
 *
 * Skip strategy:
 *   The spec runs only when `E2E_LIVE=1` is set, so default CI lanes
 *   (which still stub Firebase) are not impacted. `playwright test --list`
 *   still lists this test regardless of the env (test.skip inside the body
 *   does not affect collection).
 */

const PUBLIC_REPO_URL = 'https://github.com/sindresorhus/is';
const COMPLETION_TIMEOUT_MS = 5 * 60_000; // 5 minutes

test.describe('Sprint 5-01: Live golden path (real Firebase Emulator + worker)', () => {
  // 5 min completion + ~30s submit/nav budget.
  test.setTimeout(COMPLETION_TIMEOUT_MS + 60_000);

  test('public GitHub URL → progress UI → dashboard renders (degraded-tolerant)', async ({
    page,
  }, testInfo) => {
    test.skip(
      process.env.E2E_LIVE !== '1',
      'Live golden path requires Firebase Emulator + worker; opt-in via E2E_LIVE=1.'
    );

    const flow = new AuditFlowPage(page);

    // Arrange: load /audits/new (no stubs — real anonymous auth bootstraps).
    await flow.goto();

    // Act 1: submit the public repo URL and capture the new auditRunId.
    await flow.fillRepoUrl(PUBLIC_REPO_URL);
    const auditId = await flow.submit();
    testInfo.annotations.push({ type: 'auditRunId', description: auditId });

    // Assert 1: the progress timeline mounts.
    await flow.expectProgressVisible();

    // Act 2: wait up to 5 minutes for the run to complete and redirect.
    // Fails fast if any polling GET returns 5xx.
    await flow.waitForCompletion(auditId, COMPLETION_TIMEOUT_MS);

    // Assert 2: we landed on /audits/:id/dashboard (URL + render).
    await expect(page).toHaveURL(
      new RegExp(`/audits/${auditId}/dashboard$`)
    );

    // Assert 3: dashboard rendered SOMETHING — either the tab nav (always
    // present) or the score label (present when the report writes back).
    // Degraded environments may produce an empty report; tab nav is the
    // minimum-viable proof of completion.
    await expect(flow.dashboardNav.or(flow.scoreLabel).first()).toBeVisible();
  });
});
