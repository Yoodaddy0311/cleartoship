import { test, expect } from '@playwright/test';
import { MarketingHomePage } from './pages/MarketingHomePage';

/**
 * Sprint 3 — S3-9: Marketing landing smoke test.
 *
 * Verifies the most critical public-facing user journey:
 *   1. Marketing landing (`/`) renders the Hero with correct Korean copy.
 *   2. Primary CTA navigates away from `/` (toward `/audits/new`).
 *   3. Unknown route renders the localized 404 page.
 *
 * Why a separate spec from `golden-path.spec.ts`:
 *   - This file is intentionally **dependency-free** — no Firebase Auth stubs,
 *     no API route mocking. It exercises the static marketing surface only.
 *   - Marketing copy regressions are P0 — keep the smoke fast and stable.
 */

test.describe('Sprint 3 marketing smoke', () => {
  test('marketing landing renders hero and Korean copy', async ({ page }) => {
    const home = new MarketingHomePage(page);

    await home.goto();
    await home.expectHeroLoaded();

    // Korean copy contract — assert distinctive substrings from each Hero slot.
    await expect(home.heroEyebrow).toContainText('AI Product Auditor');
    await expect(home.heroHeadline).toContainText('출시해도 될지');
    await expect(home.heroHeadlineAccent).toContainText('5초 안에');
    await expect(home.heroHeadline).toContainText('답을 드립니다');

    // CTA labels — keep these in sync with `lib/i18n/ko.ts`.
    await expect(home.primaryCta).toContainText('무료로 감사 시작');
    await expect(home.secondaryCta).toContainText('예시 리포트 보기');

    // Primary CTA must point at the audit-start route (not external).
    const primaryHref = await home.primaryCta.getAttribute('href');
    expect(primaryHref).toBe('/audits/new');

    const secondaryHref = await home.secondaryCta.getAttribute('href');
    expect(secondaryHref).toBe('/audits/demo');
  });

  test('primary CTA navigates away from landing', async ({ page }) => {
    const home = new MarketingHomePage(page);

    await home.goto();
    await expect(page).toHaveURL(/\/$/);

    // The CTA is a Next.js `<Link>` to `/audits/new`. Under the dev server,
    // first-hit route compilation can take several seconds — extend the
    // navigation timeout accordingly. We register the URL waiter BEFORE the
    // click to avoid a race where Next.js's client-side navigation completes
    // before the listener attaches.
    //
    // Assertion: the pathname must change from `/` to `/audits/new`. We tolerate
    // either a 200 (form shipped) or 404 (form not yet wired) — both prove the
    // CTA href is correctly bound.
    const navigationPromise = page.waitForURL('**/audits/new', {
      timeout: 30_000,
      waitUntil: 'commit',
    });
    await home.clickPrimaryCta();
    await navigationPromise;

    expect(new URL(page.url()).pathname).toBe('/audits/new');
  });

  test('unknown route renders localized 404 page', async ({ page }) => {
    // Hit a route that cannot exist to force Next.js to render `not-found.tsx`.
    const response = await page.goto('/this-route-does-not-exist-e2e');
    await page.waitForLoadState('domcontentloaded');

    // Next.js returns 404 for the static asset; the body still renders.
    expect(response?.status()).toBe(404);

    // i18n contract — `common.notFound.title` / `common.notFound.cta`.
    await expect(
      page.getByRole('heading', { name: '페이지를 찾을 수 없습니다', level: 1 })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: '홈으로 돌아가기' })).toBeVisible();
  });
});
