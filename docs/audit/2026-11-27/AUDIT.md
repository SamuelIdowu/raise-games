# Full app audit — 2026-11-27

Branch `feat/frontend-overhaul` at `9bf2ba4`. Scope: build health, tests, dependencies, API
security and correctness, web security, and repo process. The frontend UX pass from
[2026-11-25](../2026-11-25/AUDIT.md) is not repeated.

## Summary

The backend is in good shape. Auth, sessions, match access, result submission, uploads,
webhooks and admin authorization all held up under review. The gaps are mostly in the newest
feature (direct and group challenges), plus one input-validation bug and repo hygiene.

| #   | Severity | Finding                                                                  |
| --- | -------- | ------------------------------------------------------------------------ |
| 1   | High     | Branch is 141 commits ahead of `main`, 30 unpushed; disk is 96% full     |
| 2   | Medium   | Blocked players can still send direct and group challenges (and notify)  |
| 3   | Medium   | Malformed pagination cursor returns 500 (about 11 endpoints)             |
| 4   | Low      | Deleted accounts can still be targeted by direct and group challenges    |
| 5   | Low      | Group challenge: two final declines at once leave it open until expiry   |
| 6   | Low      | `GET /challenges/:id` shows direct and group challenges to any player    |
| 7   | Low      | Tokens in `localStorage` with CSP `'unsafe-inline'` scripts              |
| 8   | Low      | Local lint fails: 3,794 CRLF errors (Windows checkout only)              |
| 9   | Low      | 10 moderate dependency advisories, all in transitive or dev dependencies |
| 10  | Low      | Rating replay test times out under full-suite load (flaky)               |
| 11  | Nit      | Internal showcase pages `/design` and `/font-proof` ship in the app      |
| 12  | Nit      | 6 web lint warnings; rate-limit `INCR` and `PEXPIRE` are not atomic      |

## Automated checks

| Check            | Result                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` | Pass (12/12 packages)                                                                                |
| `pnpm lint`      | API: 3,794 errors, all CRLF line endings (see #8), plus 10 `any` warnings. Web: 0 errors, 6 warnings |
| `pnpm test`      | 517 of 518 pass, 1 skipped. The one failure is a timeout that passes when run alone (see #10)        |
| `pnpm audit`     | 10 moderate, 0 high or critical (see #9)                                                             |
| Migrations       | 22 of 22 applied locally, including `0020_username_unique` and `0021_group_challenge_targets`        |

## Findings

### 1. Unmerged, unpushed work (High, process)

`feat/frontend-overhaul` is 141 commits ahead of `origin/main`, and 30 of those exist only on
this machine. `main` was last updated 2 weeks ago. PRs #7 to #14 are still open as a stack. The
disk has 11 GB free (96% used). A disk failure or a bad cleanup would lose the 30 local commits.

**Fix:** push the branch now. Then start merging the PR stack from the bottom (#7) so `main`
reflects what is built.

### 2. Blocks are ignored by challenges (Medium, trust and safety)

`user_blocks` is only checked in chat and DMs. `createChallenge` checks that targets exist and
have a game profile ([challenges.service.ts:251](../../../apps/api/src/challenges/challenges.service.ts#L251)),
but not whether a target blocked the poster. The notification worker then alerts every target
([notifications.service.ts:159](../../../apps/api/src/notifications/notifications.service.ts#L159)).
A blocked player can keep 5 open challenges at a time and post 30 a minute, so they can keep
pushing notifications to the person who blocked them. Player search
([players.service.ts:42](../../../apps/api/src/players/players.service.ts#L42)) also lists
blocked players in the picker.

**Fix:** in `createChallenge`, refuse targets with a block in either direction (one query on
`user_blocks`), using the same message for "not found" so the block is not revealed. Filter
blocked players out of `players/search`.

### 3. Malformed cursor causes a 500 (Medium, robustness)

`decodeCursor` ([cursor.ts](../../../apps/api/src/shared/cursor.ts)) only checks that the
payload is a JSON object. Callers then use its fields directly, such as
`new Date(cursor.createdAt)`. Reproduced: `GET /challenges?cursor=<base64 of {"createdAt":"x","id":"y"}>`
returns `500 Internal error`. The same pattern is in chat, DMs, notifications, players,
leaderboards and four admin lists.

**Fix:** have `decodeCursor` take a zod schema and return 400 when parsing fails. That one
change covers all 11 call sites.

### 4. Deleted accounts can be challenged (Low)

The target check in `createChallenge` does not filter on `deletedAt`, and deleted players keep
their game profile (renamed `deleted`). The web picker hides them because search filters them
out, but a direct API call can address a challenge to a deleted account. That challenge then
sits for 48 hours. Account deletion also does not close direct or group challenges that target
the deleted player.

**Fix:** add `isNull(users.deletedAt)` to the target query. In `deleteAccount`, cancel open
direct challenges to the player and mark their group entries as declined.

### 5. Group decline race (Low)

`lastOne` ([challenges.service.ts:704](../../../apps/api/src/challenges/challenges.service.ts#L704))
is computed from rows read before the transaction. If the last two members decline at the same
time, each sees the other as still pending, so neither closes the challenge. It stays open, with
nobody left who can accept it, until it expires after 48 hours.

**Fix:** inside the transaction, lock the challenge row (`FOR UPDATE`) and count the remaining
members after writing the decline. Alternatively, close it with a conditional `UPDATE … WHERE
NOT EXISTS (pending member)`.

### 6. Challenge detail is visible to everyone (Low, privacy)

`GET /challenges/:id` ([challenges.service.ts:378](../../../apps/api/src/challenges/challenges.service.ts#L378))
has no viewer check. Any signed-in player who has the id can see a direct or group challenge's
rules, its target and its group members. The ids are UUIDv7 and hard to guess, and the live
board already hides these challenges, so the exposure is small. No feature shares challenge
links.

**Fix:** for challenges with a target, return 404 unless the viewer is the poster, the target, a
group member or staff. This is the same rule `matches.access` uses.

### 7. Token storage (Low, hardening)

Access and refresh tokens are kept in `localStorage`
([fetch.ts](../../../packages/api-client/src/fetch.ts)). The CSP allows `'unsafe-inline'`
scripts, which Next.js needs with partial prerendering, so a single XSS could read a 30-day
refresh token. The current risk is low: React escapes output, and the only raw-HTML use is a
static theme script. Refresh-token reuse detection also limits the damage.

**Fix (later):** move the refresh token to an `HttpOnly; Secure; SameSite` cookie scoped to
`/auth/refresh`.

### 8. CRLF lint failures (Low, dev environment)

The files are stored with LF line endings in git. `core.autocrlf=true` converts them to CRLF on
checkout, and Prettier's `endOfLine: "lf"` then flags 3,794 errors across 9 API files. CI runs
on Linux and is not affected, but local `pnpm lint` fails, and turbo stops before linting the
other packages.

**Fix:** add `.gitattributes` with `* text=auto eol=lf`, then run `git add --renormalize .`.

### 9. Dependency advisories (Low)

There are 10 moderate advisories and nothing high or critical:

- `@opentelemetry/*`: unbounded baggage allocation, and the database username exposed in span
  attributes. These come from `auto-instrumentations-node`.
- `esbuild`: the dev server accepts cross-origin requests. This affects dev only.
- `glob` and `minimatch`: these come through the eslint and storybook toolchain.

**Fix:** bump `@opentelemetry/auto-instrumentations-node` and `sdk-node`. The rest are in
dev-only paths and can wait for routine updates.

### 10. Flaky rating replay test (Low)

`sprint10 › PRD acceptance: replaying the log reproduces every rating exactly` hit the 20-second
limit during the full parallel run. Run alone, the file passes 15 of 15.

**Fix:** give this test its own longer timeout, or reduce the number of fuzz iterations when run
in CI.

### 11–12. Nits

- The `/design` and `/font-proof` showcase pages live under `(app)` and will deploy to
  production. Gate them to development or move them out.
- Web lint warnings: unused `swatches`, `resending`, `Logo` and `toggle`. There are also two
  `window.location.assign` calls, in `settings/page.tsx` and `lib/session.ts`.
- `enforceRateLimit` runs `INCR` and then `PEXPIRE` as two separate calls. If the process dies
  between them, the key is left with no TTL and that user is limited permanently. Use a
  `MULTI` or a Lua script.

## What was checked and held up

- **Auth:** OTP attempts are claimed atomically before the code is checked. Codes are hashed
  with argon2. There are per-phone and per-IP limits and a resend cooldown. Refresh tokens
  rotate and reuse revokes the whole token family. Every request checks the session, so logout
  and bans apply at once. Mock OTP and the mock webhook secret refuse to boot outside dev.
- **Mass assignment:** `PATCH /auth/me` only accepts `displayName` and `jurisdictionState`.
  Username uniqueness is checked case-insensitively and enforced by a unique index.
- **Authorization:** every route has a guard. Staff routes go through `StaffMfaGuard`, which
  requires a staff role, TOTP and step-up for sensitive actions. Admin-only actions (roles,
  flags, formats, beta codes) are checked again in the service layer.
- **Match access:** non-participants get 404 rather than 403. WebSocket match rooms are joined
  only on the server after the same check. The live board sends new direct and group challenges
  only to the players involved.
- **Results:** the match row is locked, each side submits once, a confirmation can only mirror
  the opponent's report, and replays are idempotent per submitter.
- **Challenge accept:** a single conditional `UPDATE` picks the winner, with the match, sides
  and outbox events written in one transaction.
- **Uploads:** MIME and size are validated, files sit in quarantine and are re-encoded, and a
  perceptual-hash check catches reused screenshots. Read URLs are signed and expire quickly, and
  only the match's players and staff can get them.
- **Webhooks:** HMAC over the raw body with a timestamp, compared with `timingSafeEqual`.
- **Rate limiting:** when Redis is down, limits fall back to in-memory counters, so they never
  fail open.
- **Web:** strict CSP with an allowlist of origins, HSTS, `frame-ancestors 'none'`, nosniff,
  Permissions-Policy, and no user-controlled HTML.
- **Account deletion and export:** both cover what they should (NDPA access and erasure).

## Side effects of this audit

Signing in through mock OTP as `08031234501` and `08031234502` created two bare player accounts
in the local dev database, since the demo seed was not loaded. They have no profiles or data
and can be deleted.
