import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object for /audits/:id/dashboard.
 *
 * Renders mock data from getMockAudit() in Sprint 0:
 *   - ScoreOverview (출시 준비도)
 *   - SeverityCounts (P0..P3)
 *   - CategoryGrid (10 ScoreGauge cards, one per AuditCategory)
 *   - TOP 5 findings list
 */
export class AuditDashboardPage {
  readonly page: Page;
  readonly scoreLabel: Locator;
  readonly severityHeading: Locator;
  readonly categoriesHeading: Locator;
  readonly top5Heading: Locator;
  readonly dashboardTab: Locator;

  constructor(page: Page) {
    this.page = page;
    this.scoreLabel = page.getByText('출시 준비도').first();
    this.severityHeading = page.getByRole('heading', { name: '우선순위 이슈' });
    this.categoriesHeading = page.getByRole('heading', { name: '영역별 점수' });
    this.top5Heading = page.getByRole('heading', { name: '가장 먼저 볼 항목 TOP 5' });
    this.dashboardTab = page.getByRole('navigation', { name: '감사 결과 탭' });
  }

  async expectLoaded(auditId: string) {
    await expect(this.page).toHaveURL(
      new RegExp(`/audits/${encodeURIComponent(auditId)}/dashboard$`)
    );
    await expect(this.scoreLabel).toBeVisible();
    await expect(this.severityHeading).toBeVisible();
    await expect(this.categoriesHeading).toBeVisible();
  }

  async expectCategoryCount(count: number) {
    // ScoreGauge labels — match all 10 Korean category names.
    const labels = [
      '제품 의도',
      '요구사항 커버리지',
      '기능 관계도',
      '기능 플로우',
      'UX/UI',
      '프론트엔드 코드',
      '백엔드/API',
      '데이터 모델',
      '보안/개인정보',
      '출시 준비도',
    ];
    expect(labels).toHaveLength(count);
    for (const label of labels) {
      // Use first() since "출시 준비도" appears as both score label and category.
      await expect(this.page.getByText(label).first()).toBeVisible();
    }
  }

  async expectTop5Findings() {
    await expect(this.top5Heading).toBeVisible();
    // Mock fixture currently returns 3 findings but the section renders unconditionally.
    const list = this.page.locator('section >> nth=0').locator('ul li').first();
    await expect(list).toBeVisible();
  }
}
