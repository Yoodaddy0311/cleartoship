import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object for the Home page (/).
 *
 * Selector strategy:
 *   The Home form does not yet expose `data-testid` attributes, so we rely on
 *   accessible-name selectors (label text, role+name) which align with the
 *   Korean UI strings in `apps/web/lib/i18n/ko.ts`.
 */
export class HomePage {
  readonly page: Page;

  readonly heroTitle: Locator;
  readonly repoUrlInput: Locator;
  readonly deployUrlInput: Locator;
  readonly prdTextArea: Locator;
  readonly prdFileInput: Locator;
  readonly prdModeText: Locator;
  readonly prdModeFile: Locator;
  readonly submitButton: Locator;
  readonly repoUrlError: Locator;
  readonly deployUrlError: Locator;
  readonly fileTooLargeError: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heroTitle = page.getByRole('heading', {
      name: /출시해도 되는 코드인지/, // home.hero.title
      level: 1,
    });

    this.repoUrlInput = page.getByLabel(/GitHub 저장소 URL/);
    this.deployUrlInput = page.getByLabel(/배포 URL/);
    this.prdTextArea = page.locator('textarea#prdText');
    this.prdFileInput = page.locator('input#prdFile');

    // Radiogroup options for PRD mode.
    this.prdModeText = page.getByRole('radio', { name: /직접 입력/ });
    this.prdModeFile = page.getByRole('radio', { name: /파일 업로드/ });

    this.submitButton = page.getByRole('button', { name: /감사 시작|감사 요청 중|인증 준비 중/ });

    // Form errors render as <p role="alert"> or via `Input` `error` prop —
    // we match by text rather than role to remain resilient.
    this.repoUrlError = page.getByText('올바른 GitHub URL을 입력해주세요');
    this.deployUrlError = page.getByText('올바른 URL을 입력해주세요');
    this.fileTooLargeError = page.getByText('PRD 파일 내용이 50,000자를 초과합니다.');
  }

  async goto() {
    await this.page.goto('/');
    await expect(this.heroTitle).toBeVisible();
    // Form should mount (anonymous auth gates submit but inputs render immediately).
    await expect(this.repoUrlInput).toBeVisible();
  }

  async fillRepoUrl(url: string) {
    await this.repoUrlInput.fill(url);
  }

  async fillDeployUrl(url: string) {
    await this.deployUrlInput.fill(url);
  }

  async fillPrdText(text: string) {
    await this.selectPrdMode('text');
    await this.prdTextArea.fill(text);
  }

  async selectPrdMode(mode: 'text' | 'file') {
    if (mode === 'file') {
      await this.prdModeFile.click();
      await expect(this.prdFileInput).toBeVisible();
    } else {
      await this.prdModeText.click();
      await expect(this.prdTextArea).toBeVisible();
    }
  }

  async uploadPrdFile(filePath: string) {
    await this.selectPrdMode('file');
    await this.prdFileInput.setInputFiles(filePath);
  }

  async submit() {
    // Submit button starts disabled while anonymous auth bootstraps.
    await expect(this.submitButton).toBeEnabled({ timeout: 15_000 });
    await this.submitButton.click();
  }

  async waitForNavigationToAudit(): Promise<string> {
    // /audits/:id — capture the id from the URL.
    await this.page.waitForURL(/\/audits\/[^/]+$/, { timeout: 15_000 });
    const url = new URL(this.page.url());
    const segments = url.pathname.split('/').filter(Boolean);
    return decodeURIComponent(segments[segments.length - 1] ?? '');
  }
}
