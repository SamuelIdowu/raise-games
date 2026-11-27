import { expect, test } from '@playwright/test';
import { createPlayer, makeModerator, query, seedDispute, signIn, totp } from './fixtures';

/**
 * Sprint 12 moderator walkthrough — the PRD M3 exit condition: "a moderator resolves a
 * seeded dispute inside the SLA". Real UI, real MFA enrolment, real ruling.
 */
test('moderator enrols MFA, claims a seeded dispute, reviews evidence and rules inside the SLA', async ({
  browser,
}) => {
  const a = await createPlayer('ada');
  const b = await createPlayer('bayo');
  const mod = await createPlayer('mod');
  await makeModerator(mod, { mfa: false });
  const { matchId, disputeId } = await seedDispute(a, b);

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await signIn(context, mod);
  const page = await context.newPage();

  // 1. MFA enrolment: staff tools stay locked until a TOTP code verifies.
  await page.goto('/admin');
  await expect(
    page.getByRole('heading', { name: 'Set up two-factor authentication' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Start setup' }).click();
  const key = (await page.locator('code').innerText()).replace(/\s+/g, '');
  expect(key).toMatch(/^[A-Z2-7]{32}$/);
  await page.getByLabel('Authenticator code').fill(totp(key));
  await page.getByRole('button', { name: 'Turn on two-factor' }).click();
  await expect(page.getByRole('heading', { name: 'Trust & operations' })).toBeVisible();

  // 2. Queue: the seeded dispute is unassigned with a running SLA clock.
  await page.getByRole('link', { name: 'Disputes' }).first().click();
  const row = page.getByRole('row').filter({ hasText: 'wrong winner' }).first();
  await expect(row).toBeVisible();
  await expect(row.getByText(/left$/)).toBeVisible();
  await row.getByRole('button', { name: 'Claim' }).click();

  // 3. Viewer: evidence, players, decision panel.
  await expect(page).toHaveURL(new RegExp(`/admin/disputes/${disputeId}`));
  await expect(page.getByRole('heading', { name: /^Dispute/ })).toBeVisible();
  await expect(page.getByText('They reported the wrong winner.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Chat transcript' })).toBeVisible();

  const decision = page.getByRole('complementary', { name: 'Decision' });
  await decision.getByRole('combobox').first().selectOption('evidence_side0');
  await expect(decision.getByRole('textbox')).toHaveValue(/first player/);
  await decision.getByRole('button', { name: 'Review ruling' }).click();

  // 4. Confirmation dialog summarises effects before applying.
  const dialog = page.getByRole('dialog', { name: 'Apply this ruling?' });
  await expect(dialog.getByText(/Ratings now:/)).toBeVisible();
  await expect(dialog.getByText(/may appeal once/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Apply ruling' }).click();
  await expect(page).toHaveURL(/\/admin\/disputes$/);

  // 5. The ruling landed: match resolved for side 0, inside the 24h SLA, audited.
  const [match] = await query<{ status: string; winner_side: number }>(
    'SELECT status, winner_side FROM matches WHERE id = $1',
    [matchId],
  );
  expect(match).toMatchObject({ status: 'resolved', winner_side: 0 });
  const [d] = await query<{ status: string; within: boolean }>(
    `SELECT status, (ruled_at - created_at) < interval '24 hours' AS within FROM disputes WHERE id = $1`,
    [disputeId],
  );
  expect(d).toMatchObject({ status: 'ruled', within: true });
  const audit = await query<{ action: string }>(
    `SELECT action FROM audit_log WHERE actor_id = $1 ORDER BY created_at`,
    [mod.userId],
  );
  expect(audit.map((x) => x.action)).toEqual(
    expect.arrayContaining([
      'admin.mfa_enabled',
      'dispute.assigned',
      'dispute.evidence_read',
      'dispute.ruled',
    ]),
  );
  await context.close();
});

test('a player cannot open the moderator console', async ({ browser }) => {
  const p = await createPlayer('nosy');
  const context = await browser.newContext();
  await signIn(context, p);
  const page = await context.newPage();
  await page.goto('/admin');
  await expect(page.getByText('Moderator tools are for staff accounts.')).toBeVisible();
  await context.close();
});
