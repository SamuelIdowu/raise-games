import { expect, test, type Browser, type Page } from '@playwright/test';
import { createPlayer, createStartedMatch, signIn, uniquePng, type Player } from './fixtures';

/**
 * Sprint 8 two-browser suite: each player has their own browser context
 * (separate storage = separate signed-in user), as in a real match.
 */

async function openRoom(browser: Browser, player: Player, matchId: string): Promise<Page> {
  const context = await browser.newContext();
  await signIn(context, player);
  const page = await context.newPage();
  await page.goto(`/matches/${matchId}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('eFootball');
  return page;
}

async function submitResult(
  page: Page,
  outcome: 'I won' | 'I lost',
  self: number,
  opponent: number,
) {
  // First submitter sees "Submit result"; the opponent (confirm state) sees "Submit a different result".
  await page
    .getByRole('button', { name: /^Submit (a different )?result$/ })
    .first()
    .click();
  const sheet = page.getByRole('dialog', { name: 'Submit result' });
  await sheet.getByText(outcome, { exact: true }).click();
  await setStepper(sheet.getByRole('group', { name: 'You' }), self);
  await setStepper(sheet.getByRole('group', { name: 'Opponent' }), opponent);
  await sheet.locator('input[type="file"]:not([capture])').setInputFiles(uniquePng());
  await expect(sheet.getByText(/Screenshot added/)).toBeVisible({ timeout: 30_000 });
  // The auto-confirm rule is explained before submitting (UX Flow 5).
  await expect(sheet.getByText(/24 hours to confirm/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Submit result' }).click();
  await expect(sheet).toBeHidden();
}

async function setStepper(group: ReturnType<Page['getByRole']>, value: number) {
  const input = group.getByRole('textbox');
  await input.fill(String(value));
  await expect(input).toHaveValue(String(value));
}

test.describe('Sprint 8 — result verification (two browsers)', () => {
  test('win/loss pair auto-confirms and both see the confirmed summary', async ({ browser }) => {
    const a = await createPlayer('ada');
    const b = await createPlayer('bayo');
    const matchId = await createStartedMatch(a, b);

    const pageA = await openRoom(browser, a, matchId);
    const pageB = await openRoom(browser, b, matchId);

    await submitResult(pageA, 'I won', 2, 1);
    await expect(pageA.getByRole('heading', { name: 'Waiting for your opponent' })).toBeVisible();
    await expect(pageA.getByText('Waiting for opponent', { exact: true })).toBeVisible();

    await pageB.reload();
    await expect(
      pageB.getByRole('heading', { name: 'Your opponent submitted a result' }),
    ).toBeVisible();
    await expect(pageB.getByText('Needs confirmation', { exact: true })).toBeVisible();
    await submitResult(pageB, 'I lost', 1, 2);

    await expect(pageB.getByRole('heading', { name: 'Result confirmed' })).toBeVisible();
    await expect(pageB.getByText('Loss', { exact: true })).toBeVisible();

    await pageA.reload();
    await expect(pageA.getByRole('heading', { name: 'Result confirmed' })).toBeVisible();
    await expect(pageA.getByText('Win', { exact: true })).toBeVisible();
    // Signature moment: rating rendered through the count-up (aria-live polite).
    await expect(pageA.locator('[aria-live="polite"].tabular').first()).toBeVisible();
    // The viewer's rank in the summary (the opponent card in the room has its own badge).
    await expect(
      pageA.getByRole('region', { name: 'Result confirmed' }).getByRole('img', { name: /^Rank / }),
    ).toBeVisible();
  });

  test('opponent confirms with one tap', async ({ browser }) => {
    const a = await createPlayer('chi');
    const b = await createPlayer('dami');
    const matchId = await createStartedMatch(a, b);
    const pageA = await openRoom(browser, a, matchId);
    await submitResult(pageA, 'I lost', 0, 3);

    const pageB = await openRoom(browser, b, matchId);
    await expect(pageB.getByText('They reported: You won')).toBeVisible();
    await pageB.getByRole('button', { name: 'Confirm result' }).click();
    await expect(pageB.getByRole('heading', { name: 'Result confirmed' })).toBeVisible();
    await expect(pageB.getByText('Win', { exact: true })).toBeVisible();
  });

  test('conflicting pair opens a dispute for both players', async ({ browser }) => {
    const a = await createPlayer('emeka');
    const b = await createPlayer('funmi');
    const matchId = await createStartedMatch(a, b);
    const pageA = await openRoom(browser, a, matchId);
    const pageB = await openRoom(browser, b, matchId);

    await submitResult(pageA, 'I won', 3, 0);
    await pageB.reload();
    await pageB.getByRole('button', { name: 'Submit a different result' }).click();
    const sheet = pageB.getByRole('dialog', { name: 'Submit result' });
    await sheet.getByText('I won', { exact: true }).click();
    await setStepper(sheet.getByRole('group', { name: 'You' }), 2);
    await setStepper(sheet.getByRole('group', { name: 'Opponent' }), 1);
    await sheet.locator('input[type="file"]:not([capture])').setInputFiles(uniquePng());
    await expect(sheet.getByText(/Screenshot added/)).toBeVisible({ timeout: 30_000 });
    await sheet.getByRole('button', { name: 'Submit result' }).click();

    await expect(pageB.getByRole('heading', { name: 'Results do not match' })).toBeVisible();
    await expect(pageB.getByText('Disputed', { exact: true })).toBeVisible();
    await pageA.reload();
    await expect(pageA.getByRole('heading', { name: 'Results do not match' })).toBeVisible();
  });

  test('no-show claim requires proof of attempt before it can be sent', async ({ browser }) => {
    const a = await createPlayer('gbenga');
    const b = await createPlayer('halima');
    const matchId = await createStartedMatch(a, b, 25);
    const pageA = await openRoom(browser, a, matchId);

    const requests: string[] = [];
    pageA.on('request', (r) => r.url().includes('/no-show') && requests.push(r.url()));

    await pageA.getByRole('button', { name: 'Report no-show' }).click();
    const sheet = pageA.getByRole('dialog', { name: 'Report no-show' });
    await sheet.getByRole('button', { name: 'Report no-show' }).click();
    await expect(sheet.getByText('Add a screenshot to submit.').first()).toBeVisible();
    expect(requests).toHaveLength(0);

    await sheet.locator('input[type="file"]:not([capture])').setInputFiles(uniquePng());
    await expect(sheet.getByText(/Screenshot added/)).toBeVisible({ timeout: 30_000 });
    await expect(sheet.getByText(/they forfeit the match/)).toBeVisible();
    await sheet.getByRole('button', { name: 'Report no-show' }).click();
    await expect(pageA.getByRole('heading', { name: 'Waiting for your opponent' })).toBeVisible();
    expect(requests).toHaveLength(1);

    const pageB = await openRoom(browser, b, matchId);
    await expect(pageB.getByText('They reported that you did not show up.')).toBeVisible();
  });

  test('no-show is not offered before the 20-minute gate', async ({ browser }) => {
    const a = await createPlayer('ife');
    const b = await createPlayer('jide');
    const matchId = await createStartedMatch(a, b, 5);
    const pageA = await openRoom(browser, a, matchId);
    await expect(pageA.getByRole('button', { name: 'Report no-show' })).toHaveCount(0);
    await expect(pageA.getByText(/Report no-show from/)).toBeVisible();
  });

  test('a non-image file fails cleanly with retry and remove, and submit stays blocked', async ({
    browser,
  }) => {
    const a = await createPlayer('kemi');
    const b = await createPlayer('lanre');
    const matchId = await createStartedMatch(a, b);
    const pageA = await openRoom(browser, a, matchId);

    await pageA.getByRole('button', { name: 'Submit result' }).first().click();
    const sheet = pageA.getByRole('dialog', { name: 'Submit result' });
    await sheet.getByText('I won', { exact: true }).click();
    await setStepper(sheet.getByRole('group', { name: 'You' }), 1);
    await sheet.locator('input[type="file"]:not([capture])').setInputFiles({
      name: 'notes.png',
      mimeType: 'image/png',
      buffer: Buffer.from('this is not an image'),
    });
    await expect(sheet.getByText('This file is not a supported image.')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Remove screenshot' })).toBeVisible();
    await sheet.getByRole('button', { name: 'Submit result' }).click();
    await expect(sheet.getByText('Add a screenshot to submit.').first()).toBeVisible();

    await sheet.getByRole('button', { name: 'Remove screenshot' }).click();
    await expect(sheet.getByRole('button', { name: 'Add screenshot' })).toBeVisible();
  });
});
