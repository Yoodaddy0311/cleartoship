import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Sprint 4 Wave 2 Batch D — L-P1-7: Mobile 360px regression guard.
 *
 * Purpose:
 *   At a tight 360x640 viewport (the smallest supported Android width per
 *   `docs/PRD/sprint4-execution-plan-2026-05-18.md` §2.7), verify that Wave 1
 *   (FCS / SpecialText) + Wave 2 (Hero, eyebrow, UrlInputForm) surfaces render
 *   without overflow or missing structural elements.
 *
 * Why structural (not pixel-diff):
 *   Playwright's `toMatchSnapshot` is fragile across OS / font-stack changes.
 *   This spec uses bounding-box + visibility assertions as the regression gate;
 *   optional full-page screenshots are produced ONLY when
 *   `PW_VISUAL_BASELINE=1` is set, for ad-hoc local review.
 *
 * Coverage scope:
 *   - `/`           (marketing landing — Hero + SpecialText brand reveal)
 *   - `/audits/new` (audit start form — UrlInputForm submit button)
 *
 *   Dashboard / FCS detail pages require a live audit-run fixture that is not
 *   available in this branch (Wave 3 deliverable). Those routes are intentionally
 *   excluded from this guard — see "Issues / decisions" in the task report.
 */

const VIEWPORT = { width: 360, height: 640 } as const;
const VISUAL_BASELINE = process.env.PW_VISUAL_BASELINE === '1';
const SCREENSHOT_DIR = path.join('e2e', '.artifacts', 'mobile-360');

/**
 * Saves a full-page screenshot to e2e/.artifacts/mobile-360/<name>.png when
 * PW_VISUAL_BASELINE=1. No-op otherwise so CI stays fast.
 */
async function maybeCaptureBaseline(page: Page, name: string) {
  if (!VISUAL_BASELINE) return;
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${name}.png`),
    fullPage: true,
  });
}

test.use({ viewport: VIEWPORT });

test.describe('mobile 360px regression guard', () => {
  test.beforeEach(async ({ page }) => {
    // Belt-and-suspenders: project preset already pins viewport, but tests
    // ran via the default chromium project (e.g., during local debugging)
    // should still see 360x640.
    await page.setViewportSize({ width: VIEWPORT.width, height: VIEWPORT.height });
  });

  test('marketing home — Hero structural elements visible at 360px', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Wave 2 Batch A — Hero section + sub-components must all mount.
    await expect(page.getByTestId('hero-section')).toBeVisible();
    await expect(page.getByTestId('hero-brand-reveal')).toBeVisible();
    await expect(page.getByTestId('hero-eyebrow')).toBeVisible();
    await expect(page.getByTestId('hero-headline')).toBeVisible();
    await expect(page.getByTestId('hero-subtitle')).toBeVisible();
    await expect(page.getByTestId('hero-cta-primary')).toBeVisible();
    await expect(page.getByTestId('hero-cta-secondary')).toBeVisible();
  });

  test('marketing home — Hero h1 fits within 360px viewport', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const headlineBox = await page.getByTestId('hero-headline').boundingBox();
    expect(headlineBox, 'hero-headline bounding box').not.toBeNull();
    if (headlineBox) {
      // Headline cannot exceed the viewport width — otherwise layout has
      // shifted off-screen (regression we want to catch).
      expect(headlineBox.width).toBeLessThanOrEqual(VIEWPORT.width);
    }
  });

  test('marketing home — eyebrow and primary CTA have no text overflow', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // computed `clientWidth` should match `scrollWidth` (±8 px tolerance for
    // sub-pixel rounding). If the eyebrow / CTA wraps wider than its box,
    // ellipsis truncation or overflow would set scrollWidth > clientWidth.
    const overflow = await page.evaluate(() => {
      const ids = ['hero-eyebrow', 'hero-cta-primary'];
      return ids.map((id) => {
        const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
        if (!el) return { id, found: false, client: 0, scroll: 0 };
        return {
          id,
          found: true,
          client: el.clientWidth,
          scroll: el.scrollWidth,
        };
      });
    });

    for (const row of overflow) {
      expect(row.found, `[data-testid="${row.id}"] must exist`).toBe(true);
      const diff = row.scroll - row.client;
      expect(
        diff,
        `${row.id} overflow: scrollWidth=${row.scroll}, clientWidth=${row.client}`
      ).toBeLessThanOrEqual(8);
    }
  });

  test('marketing home — body has no horizontal scroll at 360px', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const overflow = await page.evaluate(() => {
      const html = document.documentElement;
      return {
        scrollWidth: html.scrollWidth,
        clientWidth: html.clientWidth,
      };
    });

    const diff = overflow.scrollWidth - overflow.clientWidth;
    expect(
      diff,
      `horizontal overflow: scrollWidth=${overflow.scrollWidth}, ` +
        `clientWidth=${overflow.clientWidth}`
    ).toBeLessThanOrEqual(1);
  });

  test('audit-start — UrlInputForm submit button fits and is visible', async ({
    page,
  }) => {
    await page.goto('/audits/new');
    await page.waitForLoadState('domcontentloaded');

    // The form's submit is a full-width primary <Button> — locate by role + name.
    // Tolerant regex covers `home.form.submit`, `home.form.submitting`,
    // and the auth-initialising label.
    const submit = page
      .getByRole('button', { name: /시작|분석|감사|submit|start|초기화/i })
      .first();
    await expect(submit).toBeVisible();

    const box = await submit.boundingBox();
    expect(box, 'submit button bounding box').not.toBeNull();
    if (box) {
      // Button must lay entirely inside the 360px viewport (no x-axis overflow).
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(VIEWPORT.width + 1);
    }
  });

  test('optional visual baseline capture (gated by PW_VISUAL_BASELINE=1)', async ({
    page,
  }) => {
    test.skip(!VISUAL_BASELINE, 'set PW_VISUAL_BASELINE=1 to enable');

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await maybeCaptureBaseline(page, 'marketing-home');

    await page.goto('/audits/new');
    await page.waitForLoadState('domcontentloaded');
    await maybeCaptureBaseline(page, 'audits-new');
  });
});
