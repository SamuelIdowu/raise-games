import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const stories = [
  'components-button--primary',
  'components-input--with-error',
  'components-otp-input--filled',
  'components-status-chip--match-states',
  'components-banner--all-variants',
  'components-badges--all',
  'components-avatar--deterministic',
  'components-empty-state--with-action',
  'components-table--default',
  'components-skeleton--gallery',
  'foundations-tokens--type-scale',
  'foundations-tokens--icons',
  'foundations-tokens--colors',
];

test.describe.serial('Accessibility (critical violations)', () => {
  for (const id of stories) {
    test(id, async ({ page }, testInfo) => {
      testInfo.project.name === 'dark-360' || test.skip();
      await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=theme:dark`);
      await page.waitForSelector('#storybook-root');
      await page.evaluate(() => document.fonts.ready.then(() => undefined));

      const results = await new AxeBuilder({ page }).analyze();
      const critical = results.violations.filter((violation) => violation.impact === 'critical');
      expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
    });
  }
});
