import { expect, test } from '@playwright/test';

const stories = [
  { id: 'components-button--primary', name: 'button-primary' },
  { id: 'components-button--sizes', name: 'button-sizes' },
  { id: 'components-button--disabled-with-hint', name: 'button-disabled-hint' },
  { id: 'components-input--with-error', name: 'input-error' },
  { id: 'components-otp-input--filled', name: 'otp-filled' },
  { id: 'components-status-chip--match-states', name: 'status-chips' },
  { id: 'components-banner--all-variants', name: 'banners' },
  { id: 'components-badges--all', name: 'badges' },
  { id: 'components-avatar--deterministic', name: 'avatars' },
  { id: 'components-empty-state--with-action', name: 'empty-state' },
  { id: 'components-table--default', name: 'table' },
  { id: 'components-skeleton--gallery', name: 'skeletons' },
  { id: 'foundations-tokens--type-scale', name: 'type-scale' },
  { id: 'foundations-tokens--icons', name: 'icons' },
  { id: 'foundations-tokens--colors', name: 'colors' },
];

test.describe('Component visual regression', () => {
  for (const story of stories) {
    test(story.name, async ({ page }, testInfo) => {
      const theme = testInfo.project.name.startsWith('light') ? 'light' : 'dark';
      await page.goto(`/iframe.html?id=${story.id}&viewMode=story&globals=theme:${theme}`);
      await page.waitForSelector('#storybook-root');
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await page.waitForTimeout(250);
      await expect(page).toHaveScreenshot(`${story.name}.png`, {
        fullPage: true,
        animations: 'disabled',
      });
    });
  }
});
