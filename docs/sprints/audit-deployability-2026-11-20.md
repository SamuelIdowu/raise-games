# Audit: path to a deployable Stage 1

**Date:** 2026-11-20
**Branch audited:** `feat/sprint-11-notifications` at `0cbbb28` (PR #13, which carries Sprints 6–16).
**Method:** every ticked box in `sprint-00` to `sprint-16` was checked against the code, CI and GitHub. The sprint files were also checked against the PRD v2, Technical Architecture, UX Flow Spec, Delivery Plan, decisions 0001–0007 and the earlier audits (`audit-sprints-01-11.md`, `sprint-08-audit.md`, root `SPRINT_AUDIT_REPORT.md`).
**Goal:** list everything between the current state and a free public launch in Nigeria (Stage 1, M5).

## Progress

2026-11-20/21: B1–B7, B9, B13, B22, B26, B27, B30–B33, B35 and B38 are done. The sprint files are corrected for A1–A11 (A1 and A2 are now fixed by B1).

## Where things stand

- **The code covers most of the Stage 1 features.** Auth, profiles, the board, challenges, match room and chat, results, disputes, Elo, notifications, admin and trust tools, ledger foundations, DMs (dark) and beta tooling all exist and have tests.
- **None of it is deployed.** There is no staging or production environment, no deploy pipeline and no hosting decision. Sprint 0's M0 exit was never met.
- **`main` is 49 commits behind.** Only Sprints 0–5 are merged. Sprints 6–16 sit in the open PR stack #7 → #13, so every `ship` box from Sprint 6 onward is open.
- **CI is red on HEAD.** Run 44712981487 failed: a deadlock in the `sprint14.integration` cleanup (`delete from outbox_events`, racing the outbox relay). The "Testing green" ticks in Sprints 12, 13, 14 and 16 each cite a single green run. The suite is flaky.
- **The `sprint-17-launch.md` file is missing.** The README indexes it, but it was never written.

---

## A. Boxes ticked wrongly or only partly true

Fix each one in code, or untick it and add a note.

| #   | Sprint / item                                                        | What the box claims                                                                      | What is actually there                                                                                                                                                                                                                                                                                              | Action                                                                                   |
| --- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| A1  | S3 **F3.3** "consent gate blocks Play"; **F3.7** "gate UI"           | Server and UI consent gate                                                               | `ConsentService.assertPlayAllowed` (`apps/api/src/consent/consent.service.ts:48`) is **never called**. A player who never accepted, or who needs to re-accept, can create or accept challenges, submit results and open disputes. The only gate is the onboarding page. This is audit #2, still open.               | Untick both, or implement B1.                                                            |
| A2  | S3 **Testing block**                                                 | "consent gate blocks Play" integration test                                              | No such test can pass, because the gate is not wired.                                                                                                                                                                                                                                                               | Untick, or add the test with B1.                                                         |
| A3  | S3 **F3.2** "logout, logout-all"                                     | Logout flows                                                                             | `POST /auth/logout` and `/auth/logout-all` exist, but the web app has **no sign-out control** (no "Sign out" anywhere in `apps/web/src`). The Sprint 3 E2E "logout" step cannot run through the UI.                                                                                                                 | Mark as API only; B9 adds the UI.                                                        |
| A4  | S1 **F1.7** "visual regression in CI"; S1 **Testing block**          | Visual regression in CI                                                                  | CI runs neither `test:visual` nor the Storybook a11y spec, and the baselines are Windows-only (`*-win32.png`). This is audit #4, still open.                                                                                                                                                                        | Untick, or do B16.                                                                       |
| A5  | S1 **F1.3** "theme choice persists"                                  | Persisted to profile and localStorage (feature text)                                     | localStorage only. The API stores no theme preference.                                                                                                                                                                                                                                                              | Reword to "localStorage", or add a profile field (low priority).                         |
| A6  | S0 **F0.9** "CI green on `main`; branch protection enforced"         | Spec: 1 approval, required checks, OpenAPI client regeneration job                       | Protection requires **0 approvals**. Required checks are only lint, typecheck, test and build: E2E, perf, load and gitleaks are not required. There is **no OpenAPI regeneration job**: `packages/api-client` is hand-written (1,700 lines) and the `generate:api` script is unused. `main` holds only Sprints 0–5. | Untick the regen part, or do B17 and B18.                                                |
| A7  | S6 **F6.1** "idempotency keys on all mutating routes"                | Keys on every mutation                                                                   | Only challenge create, result submit and no-show take keys (audit #7). The create key is also unique **globally**, not per poster: `challenges.idempotency_key` is `unique()` in `schema.ts` (audit #6).                                                                                                            | Reword the box; fix the scope in B13.                                                    |
| A8  | S8 **F8.2** "resumable where practical; Procfile/host notes"         | Resumable uploads, host notes                                                            | No chunked or multipart upload, only whole-file retry. No host notes exist.                                                                                                                                                                                                                                         | Reword to "retry, not resumable", or implement (low priority); write host notes with B4. |
| A9  | S11 **F11.2** "localized"                                            | Localised catalogue                                                                      | English only. The catalogue is translation-ready, but there is no i18n framework and no second locale.                                                                                                                                                                                                              | Reword to "i18n-ready (English only)".                                                   |
| A10 | S15 **F15.1** "Lighthouse CI budgets on throttled 3G gate the build" | FCP, LCP, TBT and JS weight fail CI; routes include a match room; bundle report artifact | Only **FCP** is `error`. LCP, TBT and JS weight are `warn`. The measured routes are `/`, `/onboarding/phone`, `/play` and `/leaderboard`: **no match room**. No per-route bundle report is uploaded.                                                                                                                | Reword, or promote the budgets to `error` and add a match-room URL (B19).                |
| A11 | S12, S13, S14, S16 **"Testing green"**                               | Green in CI                                                                              | Each was green once, but HEAD is red on the same deadlock class that Sprint 6 already patched. Only `sprint6.integration.test.ts` uses the retry helper.                                                                                                                                                            | Keep the ticks only after B3 lands and three consecutive green runs.                     |
| A12 | S2 **Testing block** `[~]`                                           | —                                                                                        | Honest as written. It cannot close until F2.11 runs.                                                                                                                                                                                                                                                                | None.                                                                                    |

Confirmed correct and **not** wrong: F15.4. Web errors go to `/telemetry/client-errors` and on to the API's Sentry reporter (`components/error-reporting.tsx`), so no web SDK is needed.

---

## B. Unfinished work, in priority order

### P0 — code blockers before any environment goes live

- [x] **B1 Consent gate (audit #2).** Done in `bd2cb83`: `PlayConsentGuard` on challenge create and accept, result and no-show submit, and DM and friend-request starts. The web client redirects `consent_required` to `/onboarding/consent?next=…`. Confirm, dispute and appeal stay ungated on purpose, so a re-accept prompt never costs a player the right to contest a result. Also fixed: the consent page hard-coded version 1.0, which would have locked everyone out at the first terms update. Unit test only; an HTTP-level integration test is still to add.
- [x] **B2 Real client IP behind a proxy.** Done in `bba5931`: `TRUST_PROXY` hop count for Fastify and the socket handshake (`shared/client-ip.ts`, unit-tested). Set it per environment (2 for Cloudflare plus a load balancer). Fastify runs without `trustProxy`, and every per-IP limit uses `req.ip`: OTP verify 30/IP, waitlist, invite codes and socket handshakes 60/min/IP. Behind Cloudflare or a host load balancer, **every user shares the proxy's IP**. The first busy minute would lock everyone out. Set `trustProxy` to the host's hop count and read `CF-Connecting-IP` when behind Cloudflare. Apply the same rule to the socket handshake.
- [x] **B3 Fix the flaky integration suite.** Done. Three causes fixed: cleanup deadlocks with the outbox relay (`a273e10`), tests stopping at the first empty drain (`8a76ced`), and test processes without a socket server swallowing match-state broadcasts (`7d5b5dd`). Three consecutive green runs: 44763028655 (twice) and 44771129331.
- [x] **B4 Production environment validation.** Done in `bba5931`: staging and production refuse to boot without a real SMS provider and key, Turnstile secret and R2 credentials; production also refuses localhost or plain-http `WEB_ORIGIN`/`APP_URL`. Email and VAPID stay optional until the F11.4 decision. `loadEnv` only refuses the mock OTP, the mock webhook secret and a missing MFA key. Outside dev and test it must also require `TURNSTILE_SECRET_KEY` (today Turnstile is **silently off** when the key is unset: `auth.controller.ts:44`), the R2 credentials (otherwise uploads are "unconfigured"), the SMS provider key, the JWT secrets, `APP_URL` and `WEB_ORIGIN`. Decide whether email (`RESEND_API_KEY`) and VAPID are required.
- [x] **B5 Production-grade images.** Done: non-root, health checks, OTel preload (`c9e2c70`); lean images (`df1eac0`): API from `pnpm deploy --prod` with a files allowlist, web from Next standalone (~30 MB), every `NEXT_PUBLIC_*` a build arg. Also fixed: `.dockerignore` matched `.env` only at the root, so `apps/api/.env` could reach a locally built image.
- [x] **B6 Migrations on deploy.** Done in `c9e2c70`: `node dist/db/migrate.js` (`db:migrate:deploy`), advisory-locked, reads only `DATABASE_URL`; CI migrates a clean database with it. Define a release step that runs migrations before new instances take traffic (expand-contract rule), plus the `db:seed` reference data for games and formats.
- [x] **B7 Lock down `/docs`.** Done in `bba5931`: not served in production. Swagger UI and `openapi.json` are public in every environment. Disable them in production or put them behind staff auth.
- [ ] **B8 Legal pages.** No `/terms`, `/privacy` or `/community-rules` route exists. The consent page shows "[legal] Draft terms for Stage 1". The ToS amendment for staff reading match chat (`docs/legal/tos-amendment-match-chat.md`) needs legal review. The Delivery Plan requires ToS, privacy policy, community rules and an age policy **before beta**.

### P0 — infrastructure (Sprint 0 F0.10–F0.12, never done)

- [ ] **B10 Hosting decision.** Run the Lagos latency probe against 2–3 candidate regions, then write an ADR (`docs/decisions/0008-hosting.md`). `[owner decision]`
- [ ] **B11 Provision staging, then production.** Managed Postgres with PITR, Redis, an R2 bucket (private), Cloudflare DNS, WAF and Turnstile keys, a secrets manager, the domain, Sentry, PostHog, an email domain with SPF and DKIM, the Termii DND sender ID (approval takes time, so start now), VAPID keys and `ALERT_WEBHOOK_URL`.
- [ ] **B12 Continuous deployment.** Deploy `main` to staging automatically, promote to production by hand, roll back by redeploying the previous image. Today CI builds images and pushes them nowhere.
- [ ] **B12a M0 exit proof.** A login walkthrough on staging behind Cloudflare. Then close F0.10, F0.11 and F0.12.
- [ ] **B12b The `[staging]` runs held open in Sprint 15.** 500-VU k6 run, 3,000-socket run, real low-end Android 90 s signup median (10 runs), timed PITR restore, and a Redis-kill timer test in staging (TA "Risks to derisk early"). Archive the results.

### P0 — git and process

- [ ] **B20 Merge the PR stack.** Merge #7 → #8 → #9 → #10 → #12 → #13 into `main` (rebase or merge in order). Close #11, which #12 supersedes. PR #13 is titled "Sprint 11" but carries Sprints 11–16: retitle it, or split it so review is possible. Then tick the `ship` boxes for Sprints 6–16, tag a release and move the CHANGELOG "Unreleased" section under the version.

### P1 — before the closed beta (Sprint 16 go/no-go)

- [x] **B9 Account settings page.** Done: Sign out in the menu (`8338b43`) and `/settings` (`5f7aff6`) with account details, theme (previously only on the internal `/design` page), a link to notification preferences, and sign out of all devices. CI run 44898374769 green.
- [x] **B13 Challenge idempotency scope (audit #6).** Done in `efae6ce` (migration 0017, integration test). Make the unique index `(poster_id, idempotency_key)` and scope the lookup to the poster.
- [ ] **B14 Verify the notification email (audit #3).** Send a confirmation link and email only confirmed addresses. This depends on the email vendor decision (F11.4).
- [ ] **B15 Minimum age.** The PRD and TA store an age-verification field, but signup asks nothing. Add an age confirmation to consent once the legal track sets the minimum age. `[legal]`
- [ ] **B21 New-account cooldown.** A PRD fairness control, recorded as an open finding in Sprint 16 (proposed S3). Decide it, then implement it or defer it in writing. `[owner decision]`
- [x] **B22 Admin matches screen and void action.** Done in `47918ae`: `/admin/matches` with player, status and stuck filters and a detail sheet; void needs a fresh MFA code and a reason, applies only to live undecided matches (disputed and decided ones go through rulings, which also reverse ratings and payouts), refunds holds via `match.voided`, and is audited.
- [ ] **B23 Close F11.4.** Choose the email vendor (Resend or SES), add VAPID keys per environment and prove push and email end to end on staging. `[owner decision]`
- [ ] **B24 Close F2.11.** Run 8–10 real player sessions on staging covering the three target flows, and file the findings. This is the only way to claim M1.
- [ ] **B25 Beta operations items** in Sprint 16: legal documents final and linked from onboarding, cohorts and codes issued, moderator rota staffed, then the beta opened. `[owner/legal]`

### P1 — before the public launch (write the missing Sprint 17)

- [x] **B26 Write `docs/sprints/sprint-17-launch.md`.** Done. Scope from the Delivery Plan M5: seeded local ladders, moderators staffed for the SLA, launch dashboards (stuck matches, dispute backlog, notification delivery), turning `beta.invite_only` off, the launch checklist and Stage 1 exit metrics.
- [x] **B27 Demo and local-ladder seed script.** Done in `2751eed`: `db:seed:demo` (dev/staging only); ratings come from the real consumer and CI checks the replay. Launch ladders stay real players (Sprint 17 F17.2). The Delivery Plan lists it under "day-one code" and launch needs it. Today only `load-seed.ts` (load testing) and the reference-data `seed.ts` exist.
- [ ] **B28 Data retention and deletion.** Retention periods for screenshots and chat are still an open owner decision (TA and Delivery Plan). Once set, add purge jobs. Add an account-deletion and data-request path for the Nigeria Data Protection Act, which a public launch with phone numbers will need. `[owner/legal]`
- [ ] **B29 Beta exit.** Metrics on track and open S1 = 0, as in the Sprint 16 checklist.

### P1 — PRD and TA foundations not yet built

- [x] **B30 Ledger reconciliation job.** Done in `2a1bf85`: feeds the `ledger_imbalance` alert every 5 minutes. PRD "Early technical foundations": "…webhook signature checks, idempotency, **and a reconciliation job**". Only the nightly net-zero check exists. Add a daily reconciliation of mock-provider records against ledger entries, with an alert.
- [x] **B31 KYC provider port.** Done in `7895316`: port, mock, tier rules and `KycService.applyResult`. TA and Delivery Plan M3 call for "identity tiers and KYC port". Tiers and caps exist, but there is no `KycProviderPort` or mock adapter (only schema columns). Add the interface and a mock so Stage 2 is an adapter swap.

### P2 — quality and hygiene

- [ ] **B16 Visual regression in CI (audit #4).** Generate Linux baselines in the Playwright Docker image and add a CI job for `test:visual` and the Storybook a11y spec.
- [ ] **B17 Generated API client**, or a CI check that diffs `openapi.json` against `packages/api-client`. The TA specifies "OpenAPI and a generated typed client".
- [ ] **B18 Branch protection.** Require 1 approval and add E2E, perf, load and gitleaks to the required checks.
- [ ] **B19 Lighthouse budgets.** Turn LCP, TBT and JS weight into `error` once the first staging numbers exist. Add a match-room URL (it needs a seeded match) and upload a bundle report.
- [x] **B32 Board over the socket.** Done in `aa37b69`: `board:changed` from a broadcaster on challenge outbox events (direct challenges only to their two players); the Play page refreshes on it, debounced, and polls as a fallback (20 s offline, 60 s live).
- [x] **B33 `pnpm dev` for the API.** Done: `scripts/dev.mjs` builds with tsc (decorator metadata) and restarts node on each rebuild; verified every Nest module initialises.
- [ ] **B34 Automate the socket-down fallback test.** Socket-down → polling → reconnect is verified manually only (Sprint 7 notes).
- [x] **B35 Remove tracked junk.** Done in `635d040` (`.commandcode/` left alone: it may be another tool's tracked config). `apps/api/bash.exe.stackdump` and `.commandcode/` are tracked. Root `api.log`, `web.log` and `temp.txt` are untracked; add them to `.gitignore`.
- [x] **B36 Uncaught rejections.** Kept on purpose (a half-broken API is worse than a fast restart) and documented in `docs/runbooks/deploy.md`, with the restart policy, Redis-loss behaviour and shutdown grace the host must provide.

### P2 — documentation alignment

- [ ] **B37 Product Brief.** It still reads "planning complete, pre-build" (v1). The PRD v2 says it needs aligning.
- [x] **B38 Stale root reports.** Done (`f0fff23`): moved to `docs/sprints/archive/` with a README pointing to the current audits.
- [~] **B39 Sprint README.** The Sprint 17 file now exists. `docs/sessions.md` is still one line. It indexes a missing Sprint 17 file (fixed by B26). `docs/sessions.md` is one line: fill it or remove it.
- [x] **B40 Setup Guide.** A dated "what changed" note at the top points to `.env.example`, the storage service, the new dev script, demo seed, the deploy runbook and the client contract test.

---

## C. Owner and legal decisions still blocking Stage 1

| Decision                                                   | Blocks       | Source                      |
| ---------------------------------------------------------- | ------------ | --------------------------- |
| Hosting provider and region                                | B10–B12      | F0.10, TA, Delivery Plan    |
| Email vendor (Resend or SES)                               | B14, B23     | F11.4                       |
| Legal documents: ToS, privacy, community rules, age policy | B8, B15, B25 | Delivery Plan, Sprint 16    |
| Minimum age                                                | B15          | PRD open decisions          |
| Retention periods for screenshots and chat                 | B28          | TA, Delivery Plan           |
| New-account cooldown                                       | B21          | PRD, Sprint 16 audit        |
| Moderator staffing and rota                                | B25, B26     | Delivery Plan M5, Sprint 12 |
| Beta cohorts                                               | B25          | Sprint 16                   |

Out of scope for Stage 1, gated on Stage 2: fee percentage and payer, stake bands and caps, payment and KYC providers, custody, licensing and operating states. They are recorded as inactive data (decision 0006) and are not needed to deploy Stage 1.

---

## Suggested order

1. B3 (green CI) → B20 (merge the stack to `main`).
2. B1, B2, B4–B7, B13 (code blockers) in one hardening PR.
3. Owner decisions in section C: hosting first.
4. B10–B12a (staging up, M0 exit) → B12b and B24 on staging.
5. B8, B9, B14, B15, B21–B23, B25 → closed beta.
6. B26–B31 → public launch. P2 items go in alongside, wherever they fit.
