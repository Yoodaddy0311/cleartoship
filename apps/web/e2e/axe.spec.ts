import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility smoke tests — fail the build on any critical axe-core
 * violation on the public marketing surface and the app simulation surface.
 *
 * "critical" is the highest impact level defined by axe-core; serious /
 * moderate / minor issues are surfaced in the report but not gating here.
 */

test.describe('a11y — axe-core', () => {
  test('marketing home (/) has no critical a11y violations', async ({
    page,
  }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(
      critical,
      `critical violations:\n${critical
        .map((v) => `${v.id}: ${v.description}`)
        .join('\n')}`
    ).toEqual([]);
  });

  test('app simulation page (/audits) has no critical a11y violations', async ({
    page,
  }) => {
    await page.goto('/audits');
    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(
      critical,
      `critical violations:\n${critical
        .map((v) => `${v.id}: ${v.description}`)
        .join('\n')}`
    ).toEqual([]);
  });
});
