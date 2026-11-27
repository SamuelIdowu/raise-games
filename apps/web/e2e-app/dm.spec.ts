import { expect, test, type Browser, type Page } from '@playwright/test';
import { api, createPlayer, createStartedMatch, query, signIn, type Player } from './fixtures';

/**
 * Sprint 14 — restricted DMs (two browsers). The `messaging.dm` flag is toggled per test;
 * the suite runs on one worker, so no other spec sees it flipped.
 */

async function setDmFlag(enabled: boolean) {
  const updated = await query<{ id: string }>(
    `UPDATE feature_flags SET enabled = $1
     WHERE key = 'messaging.dm' AND stage = '1' AND jurisdiction IS NULL RETURNING id`,
    [enabled],
  );
  if (updated.length === 0) {
    await query(
      `INSERT INTO feature_flags (id, key, stage, jurisdiction, enabled)
       VALUES (gen_random_uuid(), 'messaging.dm', '1', NULL, $1)`,
      [enabled],
    );
  }
}

/** A finished match: the guarded path accepted → awaiting_confirmation → confirmed. */
async function completedMatch(a: Player, b: Player) {
  const matchId = await createStartedMatch(a, b);
  await query(`UPDATE matches SET status = 'awaiting_confirmation' WHERE id = $1`, [matchId]);
  await query(`UPDATE matches SET status = 'confirmed', confirmed_at = now() WHERE id = $1`, [
    matchId,
  ]);
  return matchId;
}

async function as(browser: Browser, player: Player): Promise<Page> {
  const context = await browser.newContext();
  await signIn(context, player);
  return context.newPage();
}

async function send(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Message' }).fill(text);
  await page.getByRole('button', { name: 'Send message' }).click();
}

test.describe.serial('Sprint 14 — restricted DMs', () => {
  test.afterAll(async () => {
    await setDmFlag(false);
  });

  test('flag off: no DM affordance anywhere, deep links 404, API 404', async ({ browser }) => {
    await setDmFlag(false);
    const a = await createPlayer('off_a');
    const b = await createPlayer('off_b');
    await completedMatch(a, b);
    const page = await as(browser, a);

    await page.goto(`/profile/${b.userId}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: /Message|Add friend|Block/ })).toHaveCount(0);

    await page.goto('/inbox?tab=messages');
    await expect(page.getByRole('heading', { name: 'Match chats' })).toBeAttached();
    await expect(page.getByRole('heading', { name: 'Direct messages' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Blocked players' })).toHaveCount(0);

    await page.goto(`/messages/${crypto.randomUUID()}`);
    await expect(page.getByRole('heading', { name: /page not found/i })).toBeVisible();
    await page.goto('/messages/blocked');
    await expect(page.getByRole('heading', { name: /page not found/i })).toBeVisible();

    await expect(api('/dm/status', { token: a.accessToken })).rejects.toThrow(/404/);
    await expect(
      api('/dm/conversations', {
        method: 'POST',
        token: a.accessToken,
        body: JSON.stringify({ userId: b.userId }),
      }),
    ).rejects.toThrow(/404/);
    await page.context().close();
  });

  test('completed-match pair DMs live; strangers cannot; block cuts both ways without a reveal', async ({
    browser,
  }) => {
    await setDmFlag(true);
    const a = await createPlayer('dm_ada');
    const b = await createPlayer('dm_bayo');
    const stranger = await createPlayer('dm_nosy');
    await completedMatch(a, b);

    // A opens B's profile → Message → conversation.
    const pageA = await as(browser, a);
    await pageA.goto(`/profile/${b.userId}`);
    await pageA.getByRole('button', { name: 'Message' }).click();
    await expect(pageA).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
    const url = pageA.url();
    await expect(pageA.getByRole('heading', { level: 1 })).toContainText(b.name);

    // B is on the same conversation; A's message arrives live.
    const pageB = await as(browser, b);
    await pageB.goto(url);
    await expect(pageB.getByRole('heading', { level: 1 })).toContainText(a.name);
    const text = `rematch tonight? ${Date.now()}`;
    await send(pageA, text);
    await expect(pageB.getByRole('list', { name: 'Messages' }).getByText(text)).toBeVisible({
      timeout: 5_000,
    });
    await send(pageB, 'yes, 9pm');
    await expect(pageA.getByRole('list', { name: 'Messages' }).getByText('yes, 9pm')).toBeVisible({
      timeout: 5_000,
    });

    // The DM shows in B's inbox.
    await pageB.goto('/inbox?tab=messages');
    await expect(
      pageB.getByRole('region', { name: 'Direct messages' }).getByText(a.name),
    ).toBeVisible();

    // A stranger gets no Message button (only Add friend) and cannot open the conversation.
    const pageS = await as(browser, stranger);
    await pageS.goto(`/profile/${a.userId}`);
    await expect(pageS.getByRole('button', { name: 'Add friend' })).toBeVisible();
    await expect(pageS.getByRole('button', { name: 'Message' })).toHaveCount(0);
    await pageS.goto(url);
    await expect(pageS.getByRole('heading', { name: /page not found/i })).toBeVisible();

    // B blocks A from the conversation header.
    await pageB.goto(url);
    await pageB.getByRole('button', { name: 'Block' }).click();
    await pageB
      .getByRole('dialog', { name: `Block ${a.name}?` })
      .getByRole('button', { name: `Block ${a.name}` })
      .click();
    await expect(pageB.getByText(`You blocked ${a.name}.`)).toBeVisible();
    await expect(pageB.getByRole('textbox', { name: 'Message' })).toHaveCount(0);

    // A sees neutral copy, never "you were blocked"; history is still there.
    await pageA.reload();
    await expect(pageA.getByText('You can’t send messages in this conversation.')).toBeVisible();
    await expect(pageA.getByText(/blocked/i)).toHaveCount(0);
    await expect(pageA.getByRole('list', { name: 'Messages' }).getByText(text)).toBeVisible();

    // Accidental block: B unblocks from Blocked players and A can message again.
    await pageB.goto('/messages/blocked');
    await pageB.getByRole('button', { name: 'Unblock' }).click();
    await expect(pageB.getByText('Nobody blocked')).toBeVisible();
    await pageA.reload();
    await expect(pageA.getByRole('textbox', { name: 'Message' })).toBeVisible();

    const audit = await query<{ action: string }>(
      `SELECT action FROM audit_log WHERE actor_id = $1 AND object_id = $2`,
      [b.userId, a.userId],
    );
    expect(audit.map((r) => r.action)).toEqual(
      expect.arrayContaining(['user.blocked', 'user.unblocked']),
    );
    for (const p of [pageA, pageB, pageS]) await p.context().close();
  });

  test('friend request → accept → DM eligible', async ({ browser }) => {
    await setDmFlag(true);
    const a = await createPlayer('fr_ada');
    const c = await createPlayer('fr_chidi');

    const pageC = await as(browser, c);
    await pageC.goto(`/profile/${a.userId}`);
    await pageC.getByRole('button', { name: 'Add friend' }).click();
    await expect(pageC.getByRole('button', { name: /Request sent/ })).toBeVisible();
    await expect(pageC.getByRole('button', { name: 'Message' })).toHaveCount(0);

    const pageA = await as(browser, a);
    await pageA.goto('/inbox?tab=messages');
    const requests = pageA.getByRole('region', { name: 'Friend requests' });
    await expect(requests.getByText(c.name)).toBeVisible();
    await requests.getByRole('button', { name: 'Accept' }).click();
    await expect(pageA.getByRole('region', { name: 'Friend requests' })).toHaveCount(0);

    await pageC.reload();
    await expect(pageC.getByRole('button', { name: 'Message' })).toBeVisible();
    await pageC.getByRole('button', { name: 'Message' }).click();
    await expect(pageC).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
    await send(pageC, 'thanks for the add');
    await expect(
      pageC.getByRole('list', { name: 'Messages' }).getByText('thanks for the add'),
    ).toBeVisible();
    await expect(pageC.getByText('Sending')).toHaveCount(0);
    for (const p of [pageA, pageC]) await p.context().close();
  });
});
