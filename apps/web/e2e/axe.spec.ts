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

  test('audit-start page (/audits/new) has no critical a11y violations', async ({
    page,
  }) => {
    await page.goto('/audits/new');
    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(
      critical,
      `critical violations:\n${critical
        .map((v) => `${v.id}: ${v.description}`)
        .join('\n')}`
    ).toEqual([]);
  });

  // T2.9 #121 — sample repo gallery a11y gate
  test('samples gallery (/samples) has no critical a11y violations', async ({
    page,
  }) => {
    await page.goto('/samples');
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
