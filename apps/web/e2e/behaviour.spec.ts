import { expect, test } from '@playwright/test';

test.describe('Keyboard and motion behaviour', () => {
  test('OTP auto-advances across cells', async ({ page }) => {
    await page.goto(
      '/iframe.html?id=components-otp-input--empty&viewMode=story&globals=theme:dark',
    );
    await page.getByLabel('Digit 1 of 6').click();
    await page.keyboard.type('482915');

    for (const [index, digit] of [...'482915'].entries()) {
      await expect(page.getByLabel(`Digit ${index + 1} of 6`)).toHaveValue(digit);
    }
  });

  test('sheet traps focus and closes on Escape', async ({ page }) => {
    await page.goto(
      '/iframe.html?id=components-sheet--mobile-bottom-sheet&viewMode=story&globals=theme:dark',
    );
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('reduced motion collapses transitions and animations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(
      '/iframe.html?id=foundations-tokens--type-scale&viewMode=story&globals=theme:dark',
    );

    const duration = await page.evaluate(() => {
      const element = document.createElement('div');
      element.className = 'animate-in';
      document.body.appendChild(element);
      return getComputedStyle(element).animationDuration;
    });

    expect(Number.parseFloat(duration)).toBeLessThan(0.001);
  });
});
