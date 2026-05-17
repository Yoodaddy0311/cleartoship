import { test, expect } from '@playwright/test';
import { HomePage } from './pages/HomePage';
import { AuditProgressPage } from './pages/AuditProgressPage';
import { AuditDashboardPage } from './pages/AuditDashboardPage';

/**
 * Golden path E2E: Home → submit URL → progress (15 steps) → dashboard.
 *
 * Sprint 0 mocking strategy:
 *   - POST /api/audit-runs → fulfilled with a deterministic id ("e2e-golden").
 *   - GET  /api/audit-runs/:id → fulfilled with status=COMPLETED so the
 *     polling hook immediately redirects to /dashboard.
 *
 * The Home page also mints an anonymous Firebase Auth user on mount. In CI
 * Firebase will not be reachable; the form gates submit on `auth.uid`. We
 * therefore stub Firebase Auth REST endpoints with a stable uid before
 * navigation. If a Firebase emulator is configured via env, prefer that.
 */

const STUB_UID = 'e2e-anon-uid-0000';
const STUB_ID_TOKEN = 'e2e-stub-id-token';
const STUB_AUDIT_ID = 'e2e-golden';

test.beforeEach(async ({ page }) => {
  // Stub Firebase Auth (identitytoolkit) — `useEnsureAnonymousAuth` calls
  // signInAnonymously which hits this endpoint.
  await page.route(/identitytoolkit\.googleapis\.com.*signUp.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        idToken: STUB_ID_TOKEN,
        refreshToken: 'e2e-stub-refresh',
        expiresIn: '3600',
        localId: STUB_UID,
      }),
    });
  });

  await page.route(/identitytoolkit\.googleapis\.com.*lookup.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        kind: 'identitytoolkit#GetAccountInfoResponse',
        users: [{ localId: STUB_UID, providerUserInfo: [] }],
      }),
    });
  });

  // Stub createAuditRun (POST /api/audit-runs).
  await page.route('**/api/audit-runs', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        auditRunId: STUB_AUDIT_ID,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      }),
    });
  });

  // Stub GET /api/audit-runs/:id — return COMPLETED instantly so the polling
  // hook flips to the dashboard.
  await page.route(/.*\/api\/audit-runs\/[^/]+$/, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: STUB_AUDIT_ID,
        status: 'COMPLETED',
        currentStep: 'CLEANUP',
        progress: 100,
        startedAt: new Date(Date.now() - 60_000).toISOString(),
        completedAt: new Date().toISOString(),
      }),
    });
  });
});

// TODO Sprint 5: re-enable when Firebase Web SDK initialization can be mocked
// at the module level (page.route HTTP stubs are insufficient — the form gates
// submit on auth.uid which never resolves without real Firebase config or an
// Auth Emulator). See docs/USER-ACTIONS-QUEUE.md P0 #1 and P1 #4.
test.describe.skip('Scenario 1: Anonymous user runs audit (golden path)', () => {
  test('Home → submit → progress (15 steps) → dashboard', async ({ page }) => {
    const home = new HomePage(page);
    const progress = new AuditProgressPage(page);
    const dashboard = new AuditDashboardPage(page);

    // Arrange: load home and verify Korean copy.
    await home.goto();
    await expect(home.heroTitle).toContainText('출시');
    await expect(home.repoUrlInput).toBeVisible();
    await expect(home.deployUrlInput).toBeVisible();

    // Act: fill repo + optional deploy URL, then submit.
    await home.fillRepoUrl('https://github.com/octocat/Hello-World');
    await home.fillDeployUrl('https://example.com');
    await home.submit();

    // Assert: navigated to /audits/:id (progress page).
    const auditId = await home.waitForNavigationToAudit();
    expect(auditId).toBe(STUB_AUDIT_ID);

    await progress.expectVisible();
    await progress.expectStepCount(15);
    await progress.expectKoreanStepLabels([
      '입력 검증',
      '저장소 복제',
      'Secret 노출 검사',
      '리포트 작성',
    ]);

    // Wait for the COMPLETED status to trigger redirect (600ms peak-end delay).
    await progress.waitForDashboardRedirect(STUB_AUDIT_ID, 30_000);

    // Dashboard renders mock audit fixture.
    await dashboard.expectLoaded(STUB_AUDIT_ID);
    await dashboard.expectCategoryCount(10);
    await dashboard.expectTop5Findings();
  });

  test('navigates to dashboard even without deploy URL', async ({ page }) => {
    const home = new HomePage(page);
    const progress = new AuditProgressPage(page);
    const dashboard = new AuditDashboardPage(page);

    await home.goto();
    await home.fillRepoUrl('https://github.com/octocat/Hello-World');
    // deployUrl intentionally left blank (it is optional per home.form.deployUrl.label).
    await home.submit();

    const auditId = await home.waitForNavigationToAudit();
    await progress.expectStepCount(15);
    await progress.waitForDashboardRedirect(auditId, 30_000);
    await dashboard.expectLoaded(auditId);
  });
});
