import { test, expect, devices } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * T2.11 #122 — 03-G 모바일 폴리시 회귀 가드.
 *
 * 검증 대상 (페이지):
 *   - /              (마케팅 홈)
 *   - /audits/new    (감사 시작 폼)
 *   - /samples       (샘플 갤러리)
 *
 * 검증 항목:
 *   1. 가로 스크롤이 절대 발생하지 않는다 (document scrollWidth ≤ clientWidth)
 *      — 한국어 긴 라벨 / 큰 코드 ID / DashboardTabs 등이 자주 일으키는 회귀.
 *   2. body font-size ≥ 16px (iOS auto-zoom 방지, WCAG 1.4.4)
 *   3. body line-height ≥ 1.55 (한국어 가독성, 명세 §line-height 1.6+)
 *   4. 주요 인터랙티브(버튼/링크) ≥ 44×44 CSS px (WCAG 2.5.5 Target Size)
 *      — 좌표상 0×0인 hidden 요소는 제외 (`sr-only`, 가려진 nav 등).
 *   5. axe-core: critical violations 0 (모바일 viewport).
 *
 * Mobile viewport 두 가지로 평행 실행:
 *   - 375×667 (iPhone SE — 최소 너비)
 *   - 414×896 (iPhone 11 Pro Max — 큰 폰 너비)
 */

const TARGETS = [
  { path: '/', name: 'marketing-home' },
  { path: '/audits/new', name: 'audit-start' },
  { path: '/samples', name: 'samples' },
] as const;

// 명세에 등장한 두 viewport. Playwright preset이 아닌 손수 픽셀 지정으로
// CI가 디바이스 메트릭 변경에 영향받지 않게 함.
const VIEWPORTS = [
  { width: 375, height: 667, label: '375x667 (iPhone SE)' },
  { width: 414, height: 896, label: '414x896 (iPhone 11 Pro Max)' },
] as const;

test.describe('T2.11 mobile polish — no horizontal scroll', () => {
  for (const vp of VIEWPORTS) {
    for (const target of TARGETS) {
      test(`${target.name} @ ${vp.label} fits without horizontal scroll`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(target.path);
        await page.waitForLoadState('networkidle');

        const overflow = await page.evaluate(() => {
          // `documentElement` is the right node here — `html` carries the
          // outermost scroll. We compute the diff explicitly so we can log it
          // in the assertion message if it ever regresses.
          const html = document.documentElement;
          return {
            scrollWidth: html.scrollWidth,
            clientWidth: html.clientWidth,
            innerWidth: window.innerWidth,
          };
        });

        // Allow ≤ 1px tolerance for sub-pixel rounding in scaled layouts.
        const diff = overflow.scrollWidth - overflow.clientWidth;
        expect(
          diff,
          `horizontal overflow: scrollWidth=${overflow.scrollWidth}, ` +
            `clientWidth=${overflow.clientWidth}, innerWidth=${overflow.innerWidth}`
        ).toBeLessThanOrEqual(1);
      });
    }
  }
});

test.describe('T2.11 mobile polish — typography', () => {
  test('body font-size is ≥ 16px and line-height ≥ 1.55', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/audits/new');
    await page.waitForLoadState('networkidle');

    const typography = await page.evaluate(() => {
      const cs = window.getComputedStyle(document.body);
      return {
        // px 단위로 직접 비교. computed value는 항상 "Npx" 또는 "normal".
        fontSizePx: parseFloat(cs.fontSize),
        // line-height는 "Npx" 또는 "normal". normal일 경우 폰트 의존이라
        // 별도로 fall-back 처리.
        lineHeightRaw: cs.lineHeight,
      };
    });

    expect(typography.fontSizePx).toBeGreaterThanOrEqual(16);

    if (typography.lineHeightRaw !== 'normal') {
      const lhPx = parseFloat(typography.lineHeightRaw);
      const ratio = lhPx / 16;
      // 명세: 한국어 line-height 1.6+. 1.55까지는 round-off 허용.
      expect(ratio).toBeGreaterThanOrEqual(1.55);
    }
  });
});

test.describe('T2.11 mobile polish — touch targets WCAG 2.5.5', () => {
  test('primary interactive elements on /audits/new are ≥ 44×44 px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/audits/new');
    await page.waitForLoadState('networkidle');

    // 폼의 submit 버튼은 가장 자주 탭하는 요소 — 반드시 44px 이상이어야 함.
    const submitBox = await page
      .getByRole('button', { name: /시작|분석|submit|start/i })
      .first()
      .boundingBox();

    expect(submitBox, 'submit button bounding box').not.toBeNull();
    if (submitBox) {
      expect(submitBox.height).toBeGreaterThanOrEqual(44);
      // 폼이 fullWidth 버튼을 쓰므로 width는 자연스럽게 44 초과지만, 명시 검증.
      expect(submitBox.width).toBeGreaterThanOrEqual(44);
    }
  });

  test('PRD mode radio chips are ≥ 44 px tall', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/audits/new');
    await page.waitForLoadState('networkidle');

    // role=radio 두 개 (텍스트/파일). 각각 ≥ 44 검사.
    const radios = await page.getByRole('radio').all();
    expect(radios.length).toBeGreaterThan(0);
    for (const radio of radios) {
      const box = await radio.boundingBox();
      // sr-only 또는 hidden 라디오는 0x0 → skip
      if (!box || box.width === 0 || box.height === 0) continue;
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('T2.11 mobile polish — axe-core on mobile viewport', () => {
  test.use({ ...devices['iPhone 12'] });

  test('marketing home has no critical a11y violations on mobile', async ({
    page,
  }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(
      critical,
      `mobile critical violations:\n${critical
        .map((v) => `${v.id}: ${v.description}`)
        .join('\n')}`
    ).toEqual([]);
  });

  test('/audits/new has no critical a11y violations on mobile', async ({
    page,
  }) => {
    await page.goto('/audits/new');
    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(critical).toEqual([]);
  });
});
