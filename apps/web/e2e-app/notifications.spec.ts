import { expect, test, type Page } from '@playwright/test';
import { createPlayer, createStartedMatch, signIn, uniquePng } from './fixtures';

/**
 * Sprint 11: a domain event becomes an in-app notification, delivered live; the unread
 * badge stays in sync across two tabs of the same player; tapping a notification opens
 * the related match; preferences save.
 */

async function submitWin(page: Page) {
  await page.getByRole('button', { name: 'Submit result' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Submit result' });
  await sheet.getByText('I won', { exact: true }).click();
  await sheet.getByRole('group', { name: 'You' }).getByRole('textbox').fill('2');
  await sheet.getByRole('group', { name: 'Opponent' }).getByRole('textbox').fill('0');
  await sheet.locator('input[type="file"]:not([capture])').setInputFiles(uniquePng());
  await expect(sheet.getByText(/Screenshot added/)).toBeVisible({ timeout: 30_000 });
  await sheet.getByRole('button', { name: 'Submit result' }).click();
  await expect(sheet).toBeHidden();
}

const inboxBadge = (page: Page) =>
  page.getByRole('navigation', { name: 'Main navigation' }).getByLabel(/\d+ unread/);

test.describe('Sprint 11 — notifications and inbox', () => {
  test('live notification, cross-tab unread sync, deep link', async ({ browser }) => {
    const a = await createPlayer('wale');
    const b = await createPlayer('yemi');
    const matchId = await createStartedMatch(a, b);

    const ctxA = await browser.newContext();
    await signIn(ctxA, a);
    const pageA = await ctxA.newPage();
    await pageA.goto(`/matches/${matchId}`);

    // Player B has two tabs open on other pages.
    const ctxB = await browser.newContext();
    await signIn(ctxB, b);
    const tab1 = await ctxB.newPage();
    const tab2 = await ctxB.newPage();
    await tab1.goto('/play');
    await tab2.goto('/inbox');
    await expect(tab2.getByRole('heading', { name: 'Inbox' })).toBeVisible();

    await submitWin(pageA);

    // Both of B's tabs get the badge live (outbox relay → notification → socket).
    await expect(inboxBadge(tab1)).toHaveAttribute('aria-label', '1 unread', { timeout: 15_000 });
    await expect(inboxBadge(tab2)).toHaveAttribute('aria-label', '1 unread', { timeout: 15_000 });
    // The needs-action banner is real now.
    await expect(tab1.getByText(/Confirm the result against/)).toBeVisible({ timeout: 15_000 });

    // The inbox tab shows the item; tapping it deep-links to the match room.
    const item = tab2.getByRole('button', { name: /submitted a result/ });
    await expect(item).toBeVisible({ timeout: 15_000 });
    await item.click();
    await expect(tab2).toHaveURL(new RegExp(`/matches/${matchId}$`));

    // Reading it in one tab clears the badge in the other.
    await expect(inboxBadge(tab1)).toHaveCount(0, { timeout: 15_000 });
  });

  test('preferences: email and a per-type switch persist', async ({ browser }) => {
    const p = await createPlayer('zara');
    const ctx = await browser.newContext();
    await signIn(ctx, p);
    const page = await ctx.newPage();
    await page.goto('/inbox');
    await page.getByRole('tab', { name: 'Preferences' }).click();
    await page.getByLabel('Email address for notifications').fill('zara@example.test');
    const declined = page.getByLabel('Email: Your challenge is declined');
    await declined.check();
    // Critical types cannot be switched off.
    await expect(page.getByLabel('Email: A dispute is ruled')).toBeDisabled();
    await page.getByRole('button', { name: 'Save preferences' }).click();
    await expect(page.getByText('Preferences saved')).toBeVisible();

    await page.reload();
    await page.getByRole('tab', { name: 'Preferences' }).click();
    await expect(page.getByLabel('Email address for notifications')).toHaveValue(
      'zara@example.test',
    );
    await expect(page.getByLabel('Email: Your challenge is declined')).toBeChecked();
  });
});
