import { test, expect } from '@playwright/test';
import { HomePage } from './pages/HomePage';

/**
 * Scenario 2: PRD upload mode.
 *
 * UI Contract (from prd-input.tsx - W2-A single-mode implementation):
 *   - textarea id=prdText is always visible (no radio toggle).
 *   - File button wraps hidden file input (NOT input#prdFile).
 *   - Files > 50,000 bytes trigger inline error (audit.prd.tooLarge).
 *
 * NOTE: HomePage.ts selectPrdMode()/prdFileInput locators reference radio
 * buttons / input#prdFile that DO NOT EXIST in the actual implementation.
 * Update HomePage.ts before un-skipping. Tracked: USER-ACTIONS-QUEUE P1 #4.
 */

// TODO Sprint 5: re-enable after Firebase hydration race is resolved.
// Also: fix HomePage.ts locators to match prd-input.tsx single-mode DOM.
test.describe.skip('Scenario 2: PRD upload variant', () => {
  /** AC6 case 1 - paste */
  test('AC6-paste: textarea accepts pasted PRD text and updates byte counter', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await expect(home.prdTextArea).toBeVisible();
    const samplePrd = '# Sample PRD\n\nTest PRD content.';
    await home.prdTextArea.fill(samplePrd);
    const counter = page.locator('#prdCounter');
    await expect(counter).toBeVisible();
    const counterText = await counter.textContent();
    expect(counterText).toMatch(/^\d[\d,]* \/ 50,000$/);
    const byteCount = parseInt((counterText ?? '').replace(/[^\d]/g, ''), 10);
    expect(byteCount).toBeGreaterThan(0);
    expect(byteCount).toBeLessThan(50_000);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  /** AC6 case 2 - file */
  test('AC6-file: accepts valid PRD file under 50K bytes', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.selectPrdMode('file');
    const content = '# Sample PRD\n\nSome content under the limit.';
    await home.prdFileInput.setInputFiles({
      name: 'spec.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(content, 'utf-8'),
    });
    await expect(page.getByText(/선택된 파일/)).toBeVisible();
    await expect(home.fileTooLargeError).toHaveCount(0);
  });

  /** AC6 case 3 - oversize-reject */
  test('AC6-oversize-reject: rejects PRD file > 50K bytes with inline error', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.selectPrdMode('file');
    const oversizedContent = 'a'.repeat(50_001);
    await home.prdFileInput.setInputFiles({
      name: 'oversized.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(oversizedContent, 'utf-8'),
    });
    await expect(home.fileTooLargeError).toBeVisible();
    await expect(page.getByText(/선택된 파일/)).toHaveCount(0);
  });

  /** AC2 - client-side block */
  test('AC2-client-block: 50001-byte textarea input shows over-limit error', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    const oversized = 'a'.repeat(50_001);
    await home.prdTextArea.fill(oversized);
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('50KB');
  });

  /** AC4 - empty PRD passes null to API */
  test('AC4-empty-prd: submitting with empty textarea passes null prdText to API', async ({ page }) => {
    const STUB_UID = 'e2e-anon-uid-prd-0001';
    await page.route(/identitytoolkit\.googleapis\.com.*signUp.*/, async (route) => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ idToken: 'stub-token', refreshToken: 'stub-refresh', expiresIn: '3600', localId: STUB_UID }),
      });
    });
    let capturedBody: Record<string, unknown> | null = null;
    await page.route('**/api/audit-runs', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      try { capturedBody = route.request().postDataJSON() as Record<string, unknown>; } catch { capturedBody = null; }
      await route.fulfill({ status: 201, contentType: 'application/json',
        body: JSON.stringify({ auditRunId: 'e2e-prd-null', status: 'PENDING', createdAt: new Date().toISOString() }) });
    });
    await page.route(/.*\/api\/audit-runs\/[^/]+$/, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: 'e2e-prd-null', status: 'COMPLETED', currentStep: 'CLEANUP', progress: 100,
          startedAt: new Date(Date.now() - 60_000).toISOString(), completedAt: new Date().toISOString() }) });
    });
    const home = new HomePage(page);
    await home.goto();
    await home.fillRepoUrl('https://github.com/octocat/Hello-World');
    await home.submit();
    await page.waitForURL(/\/audits\//, { timeout: 15_000 });
    expect(capturedBody).not.toBeNull();
    const prdTextValue = (capturedBody as Record<string, unknown>)['prdText'];
    expect(prdTextValue == null || prdTextValue === '').toBe(true);
  });

  /** Legacy: file input accept attribute check */
  test('file input accepts .md and .txt only', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.selectPrdMode('file');
    const accept = await home.prdFileInput.getAttribute('accept');
    expect(accept).toBeTruthy();
    expect(accept!.split(',').map((s) => s.trim())).toEqual(
      expect.arrayContaining(['.md', '.txt', 'text/markdown', 'text/plain'])
    );
  });

  /** Legacy: mode toggle preserves textarea */
  test('toggling back to text mode preserves textarea', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.selectPrdMode('file');
    await expect(home.prdFileInput).toBeVisible();
    await home.selectPrdMode('text');
    await expect(home.prdTextArea).toBeVisible();
  });
});
