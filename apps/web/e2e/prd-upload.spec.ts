import { test, expect } from '@playwright/test';
import { HomePage } from './pages/HomePage';

/**
 * Scenario 2: PRD upload mode.
 *
 * UI Contract (from `url-input-form.tsx`):
 *   - Radio group toggles between "직접 입력" (textarea) and "파일 업로드" (file input).
 *   - File input `accept=".md,.txt,text/markdown,text/plain"` — browser-level filter.
 *   - App-level: files > 50,000 chars produce error `home.form.prd.file.tooLarge`.
 */

// TODO Sprint 5: re-enable after live-run revealed cold-compile + Firebase
// hydration race for `home.goto()` repoUrlInput visibility check. Either raise
// per-spec timeout in playwright.config.ts and pre-warm the route, or mock
// Firebase Web SDK at module level. See docs/USER-ACTIONS-QUEUE.md P1 #4.
test.describe.skip('Scenario 2: PRD upload variant', () => {
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

  test('rejects PRD file > 50K chars with Korean error toast', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.selectPrdMode('file');

    // Construct an in-memory oversized .md file via setInputFiles({ buffer }).
    const oversizedContent = 'a'.repeat(50_001);
    await home.prdFileInput.setInputFiles({
      name: 'oversized.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(oversizedContent, 'utf-8'),
    });

    await expect(home.fileTooLargeError).toBeVisible();

    // Selected-file confirmation should NOT appear.
    await expect(page.getByText(/선택된 파일/)).toHaveCount(0);
  });

  test('accepts valid PRD file under 50K chars', async ({ page }) => {
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

  test('toggling back to text mode preserves textarea', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    await home.selectPrdMode('file');
    await expect(home.prdFileInput).toBeVisible();
    await home.selectPrdMode('text');
    await expect(home.prdTextArea).toBeVisible();
  });
});
