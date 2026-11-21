import { expect, test, type Browser, type Page } from '@playwright/test';
import { createPlayer, createStartedMatch, signIn, uniquePng, type Player } from './fixtures';

/**
 * Sprint 7 two-browser suite: the match room hub, live chat and live match state over
 * the WebSocket gateway. Each player has their own browser context. Nothing here
 * reloads the page: every update must arrive live.
 */

async function openRoom(browser: Browser, player: Player, matchId: string): Promise<Page> {
  const context = await browser.newContext();
  await signIn(context, player);
  const page = await context.newPage();
  await page.goto(`/matches/${matchId}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('eFootball');
  // Live on the socket, not the polling fallback.
  await expect(page.getByText('Live updates paused')).toHaveCount(0);
  return page;
}

async function sendMessage(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Message' }).fill(text);
  await page.getByRole('button', { name: 'Send message' }).click();
}

test.describe('Sprint 7 — match room, gateway and chat (two browsers)', () => {
  test('chat is delivered live to the other player within 2 seconds', async ({ browser }) => {
    const a = await createPlayer('ife');
    const b = await createPlayer('kunle');
    const matchId = await createStartedMatch(a, b);
    const pageA = await openRoom(browser, a, matchId);
    const pageB = await openRoom(browser, b, matchId);

    const text = `ready in 5? ${Date.now()}`;
    const sentAt = Date.now();
    await sendMessage(pageA, text);
    const messagesB = pageB.getByRole('list', { name: 'Messages' });
    await expect(messagesB.getByText(text)).toBeVisible({ timeout: 2_000 });
    expect(Date.now() - sentAt).toBeLessThan(2_000);

    // The sender's bubble settles from "Sending" to sent.
    const messagesA = pageA.getByRole('list', { name: 'Messages' });
    await expect(messagesA.getByText(text)).toBeVisible();
    await expect(messagesA.getByText('Sending')).toHaveCount(0);

    await sendMessage(pageB, 'yes, room is up');
    await expect(messagesA.getByText('yes, room is up')).toBeVisible({ timeout: 2_000 });
  });

  // Audit B34: the polling fallback was only ever checked by hand. Bob starts live through
  // the real gateway; then his socket is cut and every reconnect is refused, the way a
  // flaky mobile connection drops. Everything he sees after that must arrive by polling.
  test('when the socket drops, the room falls back to polling and still gets chat', async ({
    browser,
  }) => {
    const a = await createPlayer('sade');
    const b = await createPlayer('obi');
    const matchId = await createStartedMatch(a, b);
    const pageA = await openRoom(browser, a, matchId);

    const contextB = await browser.newContext();
    await signIn(contextB, b);
    const pageB = await contextB.newPage();
    let blocked = false;
    const sockets: Array<{ close: () => Promise<void> }> = [];
    await pageB.routeWebSocket(/socket\.io/, (ws) => {
      if (blocked) return void ws.close();
      ws.connectToServer(); // pass through to the real gateway
      sockets.push(ws);
    });
    await pageB.goto(`/matches/${matchId}`);
    await expect(pageB.getByRole('heading', { level: 1 })).toContainText('eFootball');
    await expect(pageB.getByText('Live updates paused')).toHaveCount(0); // live first

    blocked = true;
    for (const ws of sockets) await ws.close();
    await expect(pageB.getByText('Live updates paused')).toBeVisible({ timeout: 10_000 });

    const text = `polling check ${Date.now()}`;
    await sendMessage(pageA, text);
    // One poll interval (5 s) plus margin; no reload.
    await expect(pageB.getByRole('list', { name: 'Messages' }).getByText(text)).toBeVisible({
      timeout: 8_000,
    });

    // And Bob can still send: HTTP is the send fallback too.
    await sendMessage(pageB, 'got it over polling');
    await expect(
      pageA.getByRole('list', { name: 'Messages' }).getByText('got it over polling'),
    ).toBeVisible({ timeout: 4_000 });
  });

  test('a result submitted in one room flips the other room live', async ({ browser }) => {
    const a = await createPlayer('tolu');
    const b = await createPlayer('emeka');
    const matchId = await createStartedMatch(a, b);
    const pageA = await openRoom(browser, a, matchId);
    const pageB = await openRoom(browser, b, matchId);

    await pageA.getByRole('button', { name: 'Submit result' }).first().click();
    const sheet = pageA.getByRole('dialog', { name: 'Submit result' });
    await sheet.getByText('I won', { exact: true }).click();
    await sheet.getByRole('group', { name: 'You' }).getByRole('textbox').fill('2');
    await sheet.getByRole('group', { name: 'Opponent' }).getByRole('textbox').fill('0');
    await sheet.locator('input[type="file"]:not([capture])').setInputFiles(uniquePng());
    await expect(sheet.getByText(/Screenshot added/)).toBeVisible({ timeout: 30_000 });
    await sheet.getByRole('button', { name: 'Submit result' }).click();
    await expect(sheet).toBeHidden();

    // B never reloads: the outbox relay pushes match:state and the room re-reads itself.
    await expect(pageB.getByText('Needs confirmation', { exact: true })).toBeVisible({
      timeout: 5_000,
    });
    await expect(
      pageB.getByRole('heading', { name: 'Your opponent submitted a result' }),
    ).toBeVisible();
  });
});
