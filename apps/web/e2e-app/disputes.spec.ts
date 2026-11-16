import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  api,
  createPlayer,
  createStartedMatch,
  makeModerator,
  signIn,
  uniquePng,
  type Player,
} from './fixtures';

/**
 * Sprint 9 two-browser suite: player-side disputes. Rulings are recorded through the
 * moderator API (the moderator queue UI is Sprint 12).
 */

async function openRoom(browser: Browser, player: Player, matchId: string): Promise<Page> {
  const context = await browser.newContext();
  await signIn(context, player);
  const page = await context.newPage();
  await page.goto(`/matches/${matchId}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('eFootball');
  return page;
}

async function submitWin(page: Page) {
  await page.getByRole('button', { name: 'Submit result' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Submit result' });
  await sheet.getByText('I won', { exact: true }).click();
  await sheet.getByRole('group', { name: 'You' }).getByRole('textbox').fill('2');
  await sheet.getByRole('group', { name: 'Opponent' }).getByRole('textbox').fill('1');
  await sheet.locator('input[type="file"]:not([capture])').setInputFiles(uniquePng());
  await expect(sheet.getByText(/Screenshot added/)).toBeVisible({ timeout: 30_000 });
  await sheet.getByRole('button', { name: 'Submit result' }).click();
  await expect(sheet).toBeHidden();
}

async function trackerText(page: Page) {
  return page.getByRole('list', { name: 'Dispute progress' }).innerText();
}

test.describe('Sprint 9 — disputes (two browsers)', () => {
  test('player opens a dispute with evidence; both see the same tracker; ruling and one appeal', async ({
    browser,
  }) => {
    const a = await createPlayer('femi');
    const b = await createPlayer('ngozi');
    const mod = await createPlayer('mod');
    await makeModerator(mod);
    const matchId = await createStartedMatch(a, b);

    const pageA = await openRoom(browser, a, matchId);
    const pageB = await openRoom(browser, b, matchId);
    await submitWin(pageA);

    // B disputes A's claim instead of confirming.
    await expect(pageB.getByText('Needs confirmation', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await pageB.getByRole('button', { name: 'Open dispute' }).click();
    const sheet = pageB.getByRole('dialog', { name: 'Open a dispute' });
    await sheet.getByLabel('What went wrong?').selectOption('wrong_winner');
    await sheet
      .getByLabel('Tell the moderator what happened')
      .fill('I won 3-1, the final screen shows it.');
    await sheet.locator('input[type="file"]:not([capture])').setInputFiles(uniquePng());
    await expect(sheet.getByText(/Screenshot added/)).toBeVisible({ timeout: 30_000 });
    await sheet.getByRole('button', { name: 'Open dispute' }).click();
    await expect(sheet).toBeHidden();

    // Both rooms show the dispute with an identical tracker (A updates live).
    await expect(pageB.getByRole('heading', { name: 'Dispute' })).toBeVisible();
    await expect(pageA.getByRole('heading', { name: 'Dispute' })).toBeVisible({ timeout: 10_000 });
    expect(await trackerText(pageA)).toBe(await trackerText(pageB));
    await expect(
      pageA.getByText('Your opponent opened this dispute.', { exact: false }),
    ).toBeVisible();

    // A moderator rules for A.
    const { dispute } = await api<{ dispute: { id: string } }>(`/matches/${matchId}/dispute`, {
      token: a.accessToken,
    });
    await api(`/admin/disputes/${dispute.id}/ruling`, {
      method: 'POST',
      token: mod.accessToken,
      body: JSON.stringify({
        outcome: 'side0_win',
        justification: 'The submitted screenshot shows 2-1 to Femi.',
      }),
    });

    // Both see the ruling and the moderator's reason, live.
    for (const page of [pageA, pageB]) {
      await expect(page.getByText('The submitted screenshot shows 2-1 to Femi.')).toBeVisible({
        timeout: 10_000,
      });
    }
    await expect(pageA.getByText('Ruling: You won')).toBeVisible();
    await expect(pageB.getByText('Ruling: You lost')).toBeVisible();

    // B appeals once; afterwards the appeal button explains why it is disabled, for both.
    await pageB.getByRole('button', { name: 'Appeal ruling' }).click();
    const appeal = pageB.getByRole('dialog', { name: 'Appeal the ruling' });
    await appeal
      .getByLabel('Why is the ruling wrong?')
      .fill('The screenshot is from a different match.');
    await appeal.getByRole('button', { name: 'Send appeal' }).click();
    await expect(appeal).toBeHidden();
    for (const page of [pageA, pageB]) {
      await expect(page.getByRole('button', { name: 'Appeal ruling' })).toBeDisabled({
        timeout: 10_000,
      });
      await expect(page.getByText(/already been appealed/)).toBeVisible();
    }
  });
});
