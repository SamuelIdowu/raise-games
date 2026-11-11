# Sprint 11 — Notifications & Inbox

- Milestone: **M2 tail**
- Stage: 1
- Depends on: Sprint 7 (gateway channel), Sprint 6/8/9 events emitted, Sprint 3 (device tokens placeholder)

## Goal

The outbox consumer that turns domain events into in-app notifications + email (reliable fallback) with dedupe/retries/quiet hours, and the Inbox experience (Design §8) with preferences per UX Flow 10. Events from the whole product (catalog below) become real deliveries.

## Features

### F11.1 Notification service + outbox consumer

- BullMQ consumer on `notifications` queue triggered by outbox events (at-least-once, consumers dedupe per message id — TA rules)
- Writes `Notification` row first (source of record), then fans out per `NotificationPreference` to in-app (socket channel), web push, and email per user pref; `DeliveryAttempt` rows for each try
- Dedupe, retries with backoff (BullMQ `attempts` + exponential, from research), batching, quiet hours (per TA spec)
- Channel interfaces: `NotificationChannel` port + adapters socket/push/email; WhatsApp/SMS behind the same interface marked later (TA)
- Failed-delivery observability counter surface for the ops alert (M4 gate has alert on failed notification delivery)

### F11.2 Stage 1 notification catalog (PRD list)

Implement every Stage 1 entry with template + preference grouping:
Challenge received · challenge accepted/declined · challenge expiring · result submitted/needs confirmation · result auto-confirmed · dispute opened · dispute ruled · no-show reported · new message · sanction applied _(roster/friend-type entries land with their sprints)_

- Templates localize (i18n from day one — doc §9); tap-through deep links to the related object (notification item contract per Design §8 "Tapping opens the related object")

### F11.3 Inbox UI

- Notifications tab grouped by day; icon/title/time/unread dot (Design §8); unread-state quick clear per session; matches badge counts live from list state (nav badge use-case)
- Messages tab (chat list from match conversations; DMs appear only if freed in Sprint 14)
- Deep linking: push + in-mail links work on ships to the right match room/chat/mail as appropriate
- Preferences screen per PRD story (per-type prefs); quiet-hours setting

### F11.4 Web push + email adapters

- Web push: service worker + subscription capture (PWA requirement), VAPID keys setup, silent re-subscribe loop (doc: iOS web push needs the installed PWA — email fallback heights the reliable channel)
- Email: Resend/SES adapter from Setup Guide envs `[owner decision]` vendor vs default mock; template pass with design-system voice (plain, calm)

### F11.5 Unread/badge aggregation + real-time sync

- Socket-delivered unread counts sync across tabs; matches-badge contract from Sprint 2 shell now real (F2.9 analytics)

## Design compliance

- Notification item spec is doc-locked (§8): icon, body-sm 600 title, caption time, unread accent dot; bookmark icons from §6 status mapping where they apply
- Toast rules hold: critical info in Inbox/banner, never a toast

## Files and references

| Ref                                                                                                                              | What                                                |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `docs/Technical Architecture RAISE.md` §Real-time, notifications, and messaging · §Background jobs · §Data model (Notifications) | Channel ports, outbox pattern, tables, iOS-PWA note |
| `docs/RAISE PRD v2 Staged Rollout.md` §"Notifications and messaging" story + catalog implications                                | Types table                                         |
| `docs/UX Flow Spec RAISE (Stage 1).md` §"Notifications catalog" + Flow 10                                                        | Catalog + screens                                   |
| `docs/Design System RAISE (Stage 1).md` §8 Notification item, Bottom navigation, §10 aria-live                                   | UI                                                  |
| `sprints/sprint-06/08/09/10`                                                                                                     | Emitted event catalogs being consumed               |
| BullMQ research note                                                                                                             | Retry/backoff config shape                          |

## Skills, agents, MCP and tools

| Kind  | Resource                                       | Use for                                                                                    |
| ----- | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Skill | `supabase-postgres-best-practices`             | Notification/delivery tables + unread-count query design                                   |
| Skill | `differential-review`/`cso`                    | Fan-out authz (never notify wrong players, no cross-user leaks in deep links)              |
| Skill | `verify` / `qa` / `test-audit` / `code-review` | Standard loop                                                                              |
| Skill | `accessibility`                                | aria-live announcements, focus on open notification target                                 |
| Skill | `frontend-design` + `design-review`            | Inbox fidelity                                                                             |
| Skill | `webapp-testing`                               | Inbox + preferences e2e + service-worker push receipt (test-capable browsers)              |
| Skill | `senior-architect`                             | Template catalog data-model ADR (template-code outbox vs DB strings)                       |
| Agent | `explore`                                      | Catalog every outbox event currently emitted across modules (single source list for F11.2) |
| Agent | `general`                                      | Vendor research: Resend vs SES deliverability/cost; web-push backend libs                  |
| MCP   | `context7`                                     | web-push + VAPID docs; Resend/SES npm docs; socket.io unread-specific patterns             |
| MCP   | `github`                                       | `[owner decision]` email vendor; PRs                                                       |
| Tools | `todowrite` F11.1–F11.5                        | Tracking                                                                                   |
| Tools | `bash`, `read`/`write`/`edit`                  | Implementation                                                                             |

## Testing

- Unit: dedupe per event id; quiet-hours bypass for critical events (documented set); template rendering with variables; PII-safe (no rule leaks into mail bodies beyond tokens)
- Integration: outbox event → notification row → in-app + email attempts rows; retry path with failure injection; preference honoring per type
- E2E: signup → challenge lifecycle → receive in-app + email mock deliveries; unread count sync across two tabs; deep link opens target screen; preference off→no delivery
- Push e2e: subscribe → deliver → click → object opens (PWA installed-mode where supported); iOS-listed caveat documented with email fallback proof

## Audit

- `cso`: no leaked states (banned/pending-consent users shouldn't receive; verify), signed-actions on links (no auto-claim via click), rate-limit loop protection
- i18n audit: catalog coverage per doc §9, strings 30%-growth handled
- Delivery-attempt audit: metrics wired at correct states for the M4 alert (stuck match alerts, deliveries failed)

## Checklist

- [ ] F11.1 Outbox consumer + channels (in-app/web push/email) with dedupe, backoff retries, batch/quiet hours; DeliveryAttempt records
- [ ] F11.2 Full Stage 1 catalog implemented + localized + tap-through deep links
- [ ] F11.3 Inbox UI per Design §8; matches-badge real; Messages tab (match chats, DM-free until F14 decision); preferences screen
- [ ] F11.4 Web push (SW + VAPID) + email adapter live; vendor decided `[owner decision]`; iOS-PWA/email fallback documented
- [ ] F11.5 Realtime unread/badge sync works across tabs and on socket reconnect
- [ ] Testing green incl. e2e delivery matrix + retries
- [ ] Audit clean: cso pass, i18n coverage, metrics wiring for M4 alert checks
- [ ] `ship` close with PR + CHANGELOG
