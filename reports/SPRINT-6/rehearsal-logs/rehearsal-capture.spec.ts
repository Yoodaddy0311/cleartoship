// S6-07 rehearsal: capture Chapter 6 demo flow screenshots + timing.
// Runs only when E2E_REHEARSAL=1 is set. Captures to reports/SPRINT-6/.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const REPO_URL = 'https://github.com/sindresorhus/is';
const ROOT = path.resolve(__dirname, '../../../');
const OUT = path.join(ROOT, 'reports/SPRINT-6/rehearsal-screenshots');
const DL_DIR = path.join(ROOT, 'reports/SPRINT-6/rehearsal-downloads');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(DL_DIR, { recursive: true });

const start = Date.now();
const lap = (label: string) => {
  const ms = Date.now() - start;
  console.log(`[REHEARSAL +${ms.toString().padStart(6, ' ')}ms] ${label}`);
};

test.describe('S6-07 rehearsal: Chapter 6 demo flow', () => {
  test.setTimeout(6 * 60_000);

  test('cold-start to PRD tab — capture screenshots + timing', async ({
    page,
    context,
  }) => {
    test.skip(
      process.env.E2E_REHEARSAL !== '1',
      'Rehearsal spec — opt-in via E2E_REHEARSAL=1.'
    );

    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const clipboardEvents: string[] = [];
    await page.exposeFunction('__recordClipboard', (text: string) => {
      clipboardEvents.push(text);
    });
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      const orig = navigator.clipboard?.writeText?.bind(navigator.clipboard);
      if (orig) {
        navigator.clipboard.writeText = async (t: string) => {
          w.__recordClipboard?.(t);
          return orig(t);
        };
      }
    });

    lap('Navigating to /audits/new');
    await page.goto('/audits/new', { waitUntil: 'domcontentloaded' });

    lap('Filling repo URL');
    const repoInput = page.getByRole('textbox', { name: /GitHub.*저장소|repo/i }).first();
    await repoInput.waitFor({ state: 'visible', timeout: 15_000 });
    await repoInput.fill(REPO_URL);

    await page.screenshot({
      path: path.join(OUT, '01-audits-new-filled.png'),
      fullPage: true,
    });
    lap('Screenshot 01-audits-new-filled.png');

    const submitBtn = page.getByRole('button', { name: /감사 시작|Start Audit/i });
    await submitBtn.waitFor({ state: 'visible' });

    const submitT0 = Date.now();
    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/audit-runs') && r.request().method() === 'POST',
        { timeout: 30_000 }
      ),
      submitBtn.click(),
    ]);
    lap(`POST /api/audit-runs ${resp.status()}`);
    expect(resp.status()).toBeLessThan(300);

    await page.waitForURL((u) => !u.toString().endsWith('/new'), { timeout: 30_000 });
    const progressUrl = page.url();
    const auditId = progressUrl.match(/\/audits\/([^/]+)/)?.[1] ?? 'unknown';
    lap(`Progress URL: ${progressUrl} (auditId=${auditId})`);

    await page.screenshot({
      path: path.join(OUT, '02-progress.png'),
      fullPage: true,
    });
    lap('Screenshot 02-progress.png');

    await page.waitForURL(/\/audits\/[^/]+\/dashboard$/, {
      timeout: 5 * 60_000,
    });
    const completionMs = Date.now() - submitT0;
    lap(`Dashboard reached in ${completionMs}ms (target < 300000ms)`);

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: path.join(OUT, '03-dashboard.png'),
      fullPage: true,
    });
    lap('Screenshot 03-dashboard.png');

    // Look for tool-unavailable banner (semgrep/osv missing).
    const banner = page
      .getByText(/toolUnavailable|분석 도구|missing|degraded|사용할 수 없/i)
      .first();
    if (await banner.count()) {
      await page.screenshot({
        path: path.join(OUT, '04-tool-banner.png'),
        fullPage: true,
      });
      lap('Screenshot 04-tool-banner.png (banner detected)');
    } else {
      lap('No tool-unavailable banner detected.');
    }

    // Walk tabs (try multiple selector strategies).
    const tabTexts = ['대시보드', '기능 관계도', '이슈 목록', '감사 리포트', '개선 PRD'];
    const tabNames: string[] = [];
    for (const txt of tabTexts) {
      const loc = page.getByText(txt, { exact: true }).first();
      if (await loc.count()) tabNames.push(txt);
    }
    lap(`Tabs found by text: ${JSON.stringify(tabNames)}`);

    // Navigate to Improvement PRD page (tabs are <Link>, so click the anchor).
    const prdTab = page.getByRole('link', { name: /개선 PRD/ }).first();
    if (await prdTab.count()) {
      const prdRespPromise = page
        .waitForResponse(
          (r) =>
            r.url().includes('/improvement-prd') &&
            r.request().method() === 'GET',
          { timeout: 15_000 }
        )
        .catch(() => null);
      await prdTab.click();
      await page.waitForURL(/\/improvement-prd$/, { timeout: 15_000 });
      const prdResp = await prdRespPromise;
      lap(`PRD API resp: ${prdResp ? prdResp.status() : '(none)'}`);
      // Wait for either the markdown download button OR a resource-state panel.
      await page
        .getByRole('button', { name: /Markdown 다운로드|markdown.*download|복사/i })
        .first()
        .waitFor({ state: 'visible', timeout: 15_000 })
        .catch(() => {});
      await page.waitForTimeout(800);
      await page.screenshot({
        path: path.join(OUT, '05-prd-tab.png'),
        fullPage: true,
      });
      lap('Screenshot 05-prd-tab.png');

      const dlBtn = page
        .getByRole('button', { name: /Markdown 다운로드|markdown.*download/i })
        .first();
      if (await dlBtn.count()) {
        const dlPromise = page.waitForEvent('download', { timeout: 10_000 });
        await dlBtn.click();
        try {
          const dl = await dlPromise;
          const saveTo = path.join(DL_DIR, dl.suggestedFilename());
          await dl.saveAs(saveTo);
          lap(`Markdown downloaded: ${saveTo}`);
        } catch (e) {
          lap(`Markdown download failed: ${(e as Error).message}`);
        }
      } else {
        lap('Markdown 다운로드 button not found');
      }

      const copyBtn = page.getByRole('button', { name: /복사|copy/i }).first();
      if (await copyBtn.count()) {
        await copyBtn.click();
        await page.waitForTimeout(1200);
        lap(`Clipboard writeText calls: ${clipboardEvents.length}`);
        // Capture the "copied" state
        await page.screenshot({
          path: path.join(OUT, '06-prd-after-copy.png'),
          fullPage: true,
        });
      } else {
        lap('복사 button not found');
      }
    } else {
      lap('Improvement PRD tab not found on dashboard');
    }

    // Score check.
    const scoreText = await page
      .getByText(/\b\d{1,3}\b.*100|점수/i)
      .first()
      .textContent()
      .catch(() => null);
    lap(`Dashboard score text: ${scoreText ?? '(none)'}`);

    // Final dashboard snapshot summary.
    fs.writeFileSync(
      path.join(OUT, 'capture-summary.json'),
      JSON.stringify(
        {
          auditId,
          completionMs,
          tabs: tabNames,
          clipboardEvents: clipboardEvents.length,
          downloadDir: DL_DIR,
        },
        null,
        2
      )
    );
  });
});
