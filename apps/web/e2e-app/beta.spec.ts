import { randomInt } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createPlayer, makeModerator, query, signIn } from './fixtures';
import { clearOtpIpLimit } from './otp-limit';

/**
 * Sprint 16 — closed beta through the real onboarding screens. `beta.invite_only` is
 * toggled per test (one worker, so no other spec sees it on) and always left off.
 */

async function setInviteOnly(enabled: boolean) {
  const updated = await query<{ id: string }>(
    `UPDATE feature_flags SET enabled = $1
     WHERE key = 'beta.invite_only' AND stage = '1' AND jurisdiction IS NULL RETURNING id`,
    [enabled],
  );
  if (updated.length === 0)
    await query(
      `INSERT INTO feature_flags (id, key, stage, jurisdiction, enabled)
       VALUES (gen_random_uuid(), 'beta.invite_only', '1', NULL, $1)`,
      [enabled],
    );
}

const localPhone = () => `080${randomInt(0, 99_999_999).toString().padStart(8, '0')}`;

async function enterOtp(page: Page) {
  await expect(page.getByRole('heading', { name: 'Verify your phone' })).toBeVisible();
  for (let i = 1; i <= 6; i++) await page.getByLabel(`Digit ${i} of 6`).fill('0');
  await page.getByRole('button', { name: 'Verify code' }).click();
}

test.describe.serial('Sprint 16 — closed beta', () => {
  test.afterAll(async () => {
    await setInviteOnly(false);
  });

  test('invite-only: a wrong code is refused, the right one creates the account in its cohort', async ({
    page,
  }) => {
    await setInviteOnly(true);
    await clearOtpIpLimit();
    const cohort = `e2e_cohort_${Date.now()}`;
    const code = `E2E${randomInt(0, 99_999).toString().padStart(5, '0')}`
      .replace(/[01]/g, '7')
      .toUpperCase();
    await query(
      `INSERT INTO invite_codes (id, code, cohort, max_uses) VALUES (gen_random_uuid(), $1, $2, 5)`,
      [code, cohort],
    );
    const phone = localPhone();

    await page.goto('/onboarding/phone');
    await page.getByLabel('Phone number').fill(phone);
    const invite = page.getByLabel('Invite code');
    await expect(invite).toBeVisible();
    await invite.fill('ZZZZ2345');
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByText('This invite code is not valid.', { exact: false })).toBeVisible();

    await invite.fill(code.toLowerCase());
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page).toHaveURL(/\/onboarding\/otp$/);
    await enterOtp(page);
    await expect(page).toHaveURL(/\/onboarding\/username$/);

    const [row] = await query<{ cohort: string; uses: number }>(
      `SELECT r.cohort, c.uses FROM invite_redemptions r
       JOIN users u ON u.id = r.user_id JOIN invite_codes c ON c.id = r.code_id
       WHERE u.phone = $1`,
      [`+234${phone.slice(1)}`],
    );
    expect(row).toMatchObject({ cohort, uses: 1 });
  });

  test('invite-only: no code → waitlist', async ({ page }) => {
    await setInviteOnly(true);
    const phone = localPhone();
    await page.goto('/onboarding/phone');
    await page.getByLabel('Phone number').fill(phone);
    await page.getByRole('button', { name: 'No code? Join the waitlist' }).click();
    const section = page.getByRole('region', { name: 'Join the waitlist' });
    await section.getByLabel('Campus or city (optional)').fill('UNILAG');
    await section.getByRole('button', { name: 'Join the waitlist' }).click();
    await expect(page.getByText('You’re on the waitlist.')).toBeVisible();
    const rows = await query<{ place: string }>(
      `SELECT place FROM beta_waitlist WHERE phone = $1`,
      [`+234${phone.slice(1)}`],
    );
    expect(rows).toEqual([{ place: 'UNILAG' }]);
  });

  test('a player sends feedback; a moderator triages it as S1 and it counts on the exit gate', async ({
    browser,
  }) => {
    await setInviteOnly(false);
    const player = await createPlayer('beta_fb');
    const mod = await createPlayer('beta_mod');
    await makeModerator(mod);

    const pc = await browser.newContext();
    await signIn(pc, player);
    const pp = await pc.newPage();
    await pp.goto('/feedback');
    const text = `My win was saved as a loss ${Date.now()}`;
    await pp.getByLabel('Details').fill(text);
    await pp.getByRole('button', { name: 'Send feedback' }).click();
    await expect(pp.getByRole('heading', { name: 'Thanks' })).toBeVisible();

    const mc = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await signIn(mc, mod);
    const mp = await mc.newPage();
    await mp.goto('/admin/feedback');
    const row = mp.getByRole('row').filter({ hasText: text });
    await expect(row).toBeVisible();
    await row.getByLabel('Severity').selectOption('S1');
    await row.getByRole('button', { name: 'Save' }).click();
    await expect(mp.getByText('Saved', { exact: true }).first()).toBeVisible();

    const [fb] = await query<{ severity: string; status: string }>(
      `SELECT severity, status FROM feedback WHERE body = $1`,
      [text],
    );
    expect(fb).toEqual({ severity: 'S1', status: 'triaged' });

    await mp.goto('/admin/metrics');
    await expect(mp.getByRole('heading', { name: 'Beta metrics' })).toBeVisible();
    await expect(mp.getByRole('table', { name: 'PRD success metrics' })).toBeVisible();
    // Close it again so later runs and the dashboard start clean.
    await query(`UPDATE feedback SET status = 'fixed' WHERE body = $1`, [text]);
    await pc.close();
    await mc.close();
  });
});
