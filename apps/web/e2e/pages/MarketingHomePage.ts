import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object for the marketing landing page (`/`).
 *
 * Selector strategy:
 *   The marketing Hero exposes `data-testid` attributes — the preferred
 *   locator strategy per Artibot E2E standards. This POM is intentionally
 *   minimal and **independent of Firebase Auth** so the marketing smoke can
 *   run without any network stubbing.
 *
 * Distinct from `HomePage.ts` which models the *audit start form* (a separate
 * surface that lives behind the primary CTA).
 */
export class MarketingHomePage {
  readonly page: Page;
  readonly heroSection: Locator;
  readonly heroEyebrow: Locator;
  readonly heroHeadline: Locator;
  readonly heroHeadlineAccent: Locator;
  readonly heroSubtitle: Locator;
  readonly primaryCta: Locator;
  readonly secondaryCta: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heroSection = page.getByTestId('hero-section');
    this.heroEyebrow = page.getByTestId('hero-eyebrow');
    this.heroHeadline = page.getByTestId('hero-headline');
    this.heroHeadlineAccent = page.getByTestId('hero-headline-accent');
    this.heroSubtitle = page.getByTestId('hero-subtitle');
    this.primaryCta = page.getByTestId('hero-cta-primary');
    this.secondaryCta = page.getByTestId('hero-cta-secondary');
  }

  async goto() {
    const response = await this.page.goto('/');
    // Fail fast with a diagnostic message when the dev server is unhealthy
    // (e.g., stale `.next` cache causing 500s). Without this guard, downstream
    // `toBeVisible()` calls produce confusing "element not found" errors.
    expect(
      response,
      'goto("/") returned no response — dev server unreachable?'
    ).not.toBeNull();
    expect(
      response!.status(),
      `Marketing landing returned HTTP ${response!.status()}. ` +
        'If this is 500, the Next.js dev server likely has a corrupted .next ' +
        'cache — restart with `rm -rf apps/web/.next && pnpm -F web dev -p 3100`.'
    ).toBeLessThan(400);
    await this.page.waitForLoadState('domcontentloaded');
    await expect(this.heroSection).toBeVisible();
  }

  async expectHeroLoaded() {
    await expect(this.heroEyebrow).toBeVisible();
    await expect(this.heroHeadline).toBeVisible();
    await expect(this.heroSubtitle).toBeVisible();
    await expect(this.primaryCta).toBeVisible();
    await expect(this.secondaryCta).toBeVisible();
  }

  async clickPrimaryCta() {
    await this.primaryCta.click();
  }

  async clickSecondaryCta() {
    await this.secondaryCta.click();
  }
}
