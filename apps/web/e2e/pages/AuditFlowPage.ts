import { type Page, type Locator, type Response, expect } from '@playwright/test';

/**
 * Page Object for the Sprint 5 live golden path:
 *   /audits/new  →  /audits/:id (progress)  →  /audits/:id/dashboard.
 *
 * Unlike `HomePage` + `AuditProgressPage` (which model the mocked Sprint 0
 * flow), this POM is purpose-built for live end-to-end runs against a real
 * Firebase Emulator + Worker pipeline. It therefore:
 *
 *   - Does NOT stub Firebase Auth or `/api/audit-runs` — the test exercises
 *     the actual anonymous-auth + worker pipeline.
 *   - Uses `domcontentloaded` (never `networkidle`) — the progress polling
 *     hook keeps the network active throughout the run.
 *   - Relies on existing accessible-name selectors (role + label) because the
 *     audit form/progress/dashboard surfaces do not expose `data-testid`
 *     attributes (verified via `grep data-testid apps/web/app/audits` and
 *     `apps/web/components/{audit-start,audit-progress,dashboard}`). Adding
 *     new test ids is out-of-scope for this spec (STRICT work area).
 *   - Treats `status: completed` as success — finding counts are NOT asserted
 *     so that degraded environments (missing semgrep/osv/lighthouse) still
 *     pass.
 */
export class AuditFlowPage {
  readonly page: Page;

  // /audits/new surface (matches HomePage.ts patterns).
  readonly heroTitle: Locator;
  readonly repoUrlInput: Locator;
  readonly submitButton: Locator;

  // /audits/:id (progress) surface (matches AuditProgressPage.ts patterns).
  readonly progressHeading: Locator;
  readonly progressBar: Locator;
  readonly timelineList: Locator;

  // /audits/:id/dashboard surface (matches AuditDashboardPage.ts patterns).
  readonly dashboardNav: Locator;
  readonly scoreLabel: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heroTitle = page.getByRole('heading', {
      name: /출시해도 되는 코드인지/,
      level: 1,
    });
    this.repoUrlInput = page.getByLabel(/GitHub 저장소 URL/);
    this.submitButton = page.getByRole('button', {
      name: /감사 시작|감사 요청 중|인증 준비 중/,
    });

    this.progressHeading = page.getByRole('heading', {
      name: /감사 진행 중/,
      level: 1,
    });
    this.progressBar = page.getByRole('progressbar').first();
    this.timelineList = page.getByRole('list', { name: '감사 단계 진행' });

    this.dashboardNav = page.getByRole('navigation', { name: '감사 결과 탭' });
    this.scoreLabel = page.getByText('출시 준비도').first();
  }

  async goto() {
    const response = await this.page.goto('/audits/new');
    expect(
      response,
      'goto("/audits/new") returned no response — dev server unreachable?'
    ).not.toBeNull();
    expect(
      response!.status(),
      `audits/new returned HTTP ${response!.status()} — dev server unhealthy.`
    ).toBeLessThan(400);
    // domcontentloaded only (networkidle is forbidden — polling keeps the
    // network busy and would never settle).
    await this.page.waitForLoadState('domcontentloaded');
    await expect(this.heroTitle).toBeVisible();
    await expect(this.repoUrlInput).toBeVisible();
  }

  async fillRepoUrl(url: string) {
    await this.repoUrlInput.fill(url);
  }

  /**
   * Submit the audit form and wait for navigation to `/audits/:id`.
   *
   * Fails fast on 5xx responses from `POST /api/audit-runs` — degraded
   * pipelines are tolerated downstream, but a server error at submit time
   * is unambiguous and not worth waiting on.
   */
  async submit(): Promise<string> {
    // Submit gate: anonymous auth bootstrap can take a few seconds against
    // the live emulator.
    await expect(this.submitButton).toBeEnabled({ timeout: 20_000 });

    const [createResponse] = await Promise.all([
      this.page.waitForResponse(
        (r) =>
          r.url().includes('/api/audit-runs') &&
          r.request().method() === 'POST',
        { timeout: 30_000 }
      ),
      this.submitButton.click(),
    ]);

    const status = createResponse.status();
    expect(
      status,
      `POST /api/audit-runs failed with HTTP ${status} — fail-fast on 5xx.`
    ).toBeLessThan(500);
    expect(status, `POST /api/audit-runs returned HTTP ${status}.`).toBeLessThan(
      300
    );

    await this.page.waitForURL(/\/audits\/(?!new$)[^/]+$/, { timeout: 20_000 });
    const url = new URL(this.page.url());
    const segments = url.pathname.split('/').filter(Boolean);
    const auditId = decodeURIComponent(segments[segments.length - 1] ?? '');
    expect(auditId, 'auditId not parseable from URL').not.toBe('');
    return auditId;
  }

  async expectProgressVisible() {
    await expect(this.progressHeading).toBeVisible();
    await expect(this.progressBar).toBeVisible();
    await expect(this.timelineList).toBeVisible();
  }

  /**
   * Poll `GET /api/audit-runs/:id` (via the page's own polling hook) until
   * the run reaches `COMPLETED` status, then wait for the client-side
   * redirect to `/audits/:id/dashboard`.
   *
   * Degraded acceptance: only `status: completed` is asserted. Finding
   * counts, severity buckets, and score values are NOT verified — they can
   * legitimately be empty/zero when semgrep/osv/lighthouse are missing on
   * the runner.
   *
   * Fails fast if any in-flight GET returns a 5xx.
   */
  async waitForCompletion(auditId: string, timeoutMs = 300_000): Promise<void> {
    // Install a 5xx tripwire on the polling GET. We capture the first 5xx
    // so we can re-throw it after the navigation race resolves.
    let serverErrorStatus: number | null = null;
    const tripwire = (response: Response) => {
      const url = response.url();
      const isPoll =
        url.includes(`/api/audit-runs/${encodeURIComponent(auditId)}`) &&
        response.request().method() === 'GET';
      if (isPoll && response.status() >= 500 && serverErrorStatus === null) {
        serverErrorStatus = response.status();
      }
    };
    this.page.on('response', tripwire);

    try {
      await this.page.waitForURL(
        `**/audits/${encodeURIComponent(auditId)}/dashboard`,
        { timeout: timeoutMs }
      );
    } finally {
      this.page.off('response', tripwire);
    }

    if (serverErrorStatus !== null) {
      throw new Error(
        `GET /api/audit-runs/${auditId} returned HTTP ${serverErrorStatus} during polling — fail-fast on 5xx.`
      );
    }

    // Confirm the dashboard rendered (degraded mode: any score label OR
    // the tab nav constitutes "rendered"). Use `.or()` so missing report
    // bodies don't fail this assertion.
    await expect(this.dashboardNav.or(this.scoreLabel).first()).toBeVisible({
      timeout: 30_000,
    });
  }
}
