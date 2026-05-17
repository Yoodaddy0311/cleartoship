// S6-07: Manual capture of Chapter 6 demo flow — used only for the
// rehearsal evidence pack. Runs against the live dev server at :3000
// with the Firebase emulators + audit worker already up.
// Output: PNG screenshots under reports/SPRINT-6/rehearsal-screenshots/.
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const REPO_URL = 'https://github.com/sindresorhus/is';
const BASE = 'http://localhost:3000';
const OUT = path.resolve(
  'reports/SPRINT-6/rehearsal-screenshots'
);
fs.mkdirSync(OUT, { recursive: true });

const DL_DIR = path.resolve('reports/SPRINT-6/rehearsal-downloads');
fs.mkdirSync(DL_DIR, { recursive: true });

const start = Date.now();
const lap = (label) => {
  const ms = Date.now() - start;
  console.log(`[${ms.toString().padStart(6, ' ')}ms] ${label}`);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 900 },
});
// Capture clipboard event
await context.grantPermissions(['clipboard-read', 'clipboard-write']);
const page = await context.newPage();

const clipboardEvents = [];
await page.exposeFunction('__recordClipboard', (text) => {
  clipboardEvents.push(text);
});
await page.addInitScript(() => {
  const original = navigator.clipboard?.writeText?.bind(navigator.clipboard);
  if (original) {
    navigator.clipboard.writeText = async (t) => {
      window.__recordClipboard?.(t);
      return original(t);
    };
  }
});

try {
  lap('Navigating to /audits/new');
  await page.goto(`${BASE}/audits/new`, { waitUntil: 'domcontentloaded' });

  lap('Filling repo URL');
  // Use semantic locator (textbox labeled "GitHub Repo URL")
  const repoInput = page.getByRole('textbox', { name: /GitHub.*저장소|repo/i }).first();
  await repoInput.waitFor({ state: 'visible', timeout: 15000 });
  await repoInput.fill(REPO_URL);

  await page.screenshot({ path: path.join(OUT, '01-audits-new-filled.png'), fullPage: true });
  lap('Screenshot 01-audits-new-filled.png');

  const submitBtn = page.getByRole('button', { name: /감사 시작|Start Audit/i });
  await submitBtn.waitFor({ state: 'visible' });

  const submitT0 = Date.now();
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/audit-runs') && r.request().method() === 'POST',
      { timeout: 30000 }
    ),
    submitBtn.click(),
  ]);
  lap('POST /api/audit-runs completed');

  // Wait for URL to leave /new
  await page.waitForURL((u) => !u.toString().endsWith('/new'), { timeout: 30000 });
  const progressUrl = page.url();
  const auditIdMatch = progressUrl.match(/\/audits\/([^/]+)/);
  const auditId = auditIdMatch?.[1] ?? 'unknown';
  lap(`Progress URL: ${progressUrl} (auditId=${auditId})`);

  await page.screenshot({ path: path.join(OUT, '02-progress.png'), fullPage: true });
  lap('Screenshot 02-progress.png');

  // Wait for dashboard redirect
  await page.waitForURL(/\/audits\/[^/]+\/dashboard$/, { timeout: 5 * 60_000 });
  const completionMs = Date.now() - submitT0;
  lap(`Dashboard reached in ${completionMs}ms (target < 5min)`);

  // Wait for content to render
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500); // Allow charts to render

  await page.screenshot({ path: path.join(OUT, '03-dashboard.png'), fullPage: true });
  lap('Screenshot 03-dashboard.png');

  // Look for any tool-unavailable banner
  const banner = page.getByText(/toolUnavailable|분석 도구|missing|degraded/i).first();
  if (await banner.count()) {
    await banner.scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: path.join(OUT, '04-tool-banner.png'), fullPage: true });
    lap('Screenshot 04-tool-banner.png (banner detected)');
  } else {
    lap('No tool-unavailable banner detected — skipping screenshot 04');
  }

  // Navigate to Improvement PRD tab
  const prdTab = page.getByRole('tab', { name: /Improvement PRD|개선/i }).first();
  if (await prdTab.count()) {
    await prdTab.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, '05-prd-tab.png'), fullPage: true });
    lap('Screenshot 05-prd-tab.png');

    // Trigger Markdown download
    const dlBtn = page.getByRole('button', { name: /Markdown 다운로드|markdown.*download/i }).first();
    if (await dlBtn.count()) {
      const dlPromise = page.waitForEvent('download', { timeout: 10_000 });
      await dlBtn.click();
      try {
        const dl = await dlPromise;
        const saveTo = path.join(DL_DIR, dl.suggestedFilename());
        await dl.saveAs(saveTo);
        lap(`Markdown downloaded to ${saveTo}`);
      } catch (e) {
        lap(`Markdown download failed: ${e.message}`);
      }
    } else {
      lap('Markdown 다운로드 button not found on PRD tab');
    }

    // Click 복사
    const copyBtn = page.getByRole('button', { name: /^복사$|copy/i }).first();
    if (await copyBtn.count()) {
      await copyBtn.click();
      await page.waitForTimeout(500);
      lap(`Clipboard events captured: ${clipboardEvents.length}`);
    } else {
      lap('복사 button not found');
    }
  } else {
    lap('Improvement PRD tab not found');
  }

  // Also look at all visible tabs
  const tabs = await page.getByRole('tab').allTextContents();
  lap(`Tabs found: ${JSON.stringify(tabs)}`);

  // Score check
  const scoreEl = page.getByText(/\b\d{1,3}\s*\/\s*100\b|점수|score/i).first();
  if (await scoreEl.count()) {
    const txt = await scoreEl.textContent();
    lap(`Score text: ${txt}`);
  }

  console.log(JSON.stringify({
    ok: true,
    auditId,
    completionMs,
    tabs,
    clipboardEvents,
  }));
} catch (err) {
  console.error('CAPTURE FAILED:', err.message);
  try { await page.screenshot({ path: path.join(OUT, '99-error.png'), fullPage: true }); } catch {}
  process.exitCode = 1;
} finally {
  await browser.close();
}
