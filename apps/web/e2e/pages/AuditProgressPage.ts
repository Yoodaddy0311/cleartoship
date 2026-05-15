import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object for /audits/:id (progress timeline).
 *
 * The page renders a 15-step ordered list inside an `<ol aria-label="감사 단계 진행">`.
 * Status transitions to COMPLETED via the polling hook; when reached, the
 * client redirects to `/audits/:id/dashboard` after a 600ms peak-end delay.
 */
export class AuditProgressPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly timelineList: Locator;
  readonly timelineSteps: Locator;
  readonly progressBar: Locator;
  readonly errorMessage: Locator;
  readonly retryButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /감사 진행 중/, level: 1 });
    this.timelineList = page.getByRole('list', { name: '감사 단계 진행' });
    this.timelineSteps = this.timelineList.getByRole('listitem');
    this.progressBar = page.getByRole('progressbar').first();
    this.errorMessage = page.getByText('감사 도중 문제가 발생했습니다');
    this.retryButton = page.getByRole('button', { name: '다시 시도' });
  }

  async expectVisible() {
    await expect(this.heading).toBeVisible();
    await expect(this.timelineList).toBeVisible();
  }

  async expectStepCount(count: number) {
    await expect(this.timelineSteps).toHaveCount(count);
  }

  async expectKoreanStepLabels(labels: string[]) {
    for (const label of labels) {
      await expect(this.timelineList).toContainText(label);
    }
  }

  async waitForDashboardRedirect(auditId: string, timeoutMs = 60_000) {
    await this.page.waitForURL(`**/audits/${encodeURIComponent(auditId)}/dashboard`, {
      timeout: timeoutMs,
    });
  }

  async expectErrorState() {
    await expect(this.errorMessage).toBeVisible();
    await expect(this.retryButton).toBeVisible();
  }
}
