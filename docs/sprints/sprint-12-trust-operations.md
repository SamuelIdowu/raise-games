# Sprint 12 — Trust & Operations (Admin, Moderation, Reputation, Fraud Signals)

- Milestone: **M3** (Delivery Plan weeks 8–11)
- Stage: 1
- Depends on: Sprints 8–11 (evidence, results, disputes, notifications)

## Goal

The ops layer M3 calls "trust and operations": admin dashboard and dispute queue, sanction ladder, reputation engine, fraud signals + image hashing consumers, leaderboards polish, and admin MFA. PRD exit: a moderator resolves a seeded dispute inside the SLA.

## Features

### F12.1 Admin foundation

- Admin routes under `/admin` (role-gated); admin accounts require MFA — TOTP enabled now (Setup Guide F0.7 placeholder completes here); session re-verification for sensitive pages
- Admin dashboard home: queue counters (disputes by state, SLA clocks, stuck-match list), top reports, rotation of seed info
- Feature-flag admin per PRD story (keys existed since Sprint 0 — now an admin UI flags viewer + toggles: stage flags, jurisdiction flags)
- Users admin: search (username/phone partially masked), detail view, role grant/revoke with audit, sanction ladder apply per Design rules (warning → 7d → 30d → permanent ban), temp-detention
- Audit log viewer for admin surface: filter, search, transparent
- Game/format config admin: view + amend config entries (complete F4 admin stub)

### F12.2 Dispute queue + viewer (Design §8 admin dispute viewer)

- Queue: unassigned / assigned / awaiting info / resolved states (Design), assignment, SLA clock per dispute (median target < 24h from PRD; timers on the dashboard)
- Decision templates for common rulings; reason templates per design doc
- Evidencing (Design §8): submissions side by side on desktop (tabbed mobile), zoomable screenshots, hash flags shown inline (e.g. "Reused screenshot — link to earlier match" from Sprint 8 hash storage), chat transcript inline (from F7.4/F9.3 snapshot), each player's dispute history
- Decision panel: outcome, reason, internal notes, sanction toggle with the ladder step; confirmation dialog summarizing effects (ratings now; holds/payouts in Stage 2 per Design doc) before applying a ruling
- Ruling applies: ratings update (F10 flow), reputation updates, notifications (F11 catalog ruled events), audit log updates

### F12.3 Reputation engine + sanctions enforcement

- Reputation: New/Low/Reliable/Trusted from completion and dispute rates — thresholds designed here from the serviced data (`[owner decision]` to confirm numbers); badge surfaces everywhere Design says
- Sanction ladder enforcement: sanctioned players cannot create/accept challenges; sessions revoked at permanent-ban (F3.2 mechanism triggers); ban-displayed copy respects user's dignity (no shaming copy; Design §9)
- Late-cancel costs + suspensions effects wired to the F6.3 pending debt records

### F12.4 Fraud signals consumed (day-one collectors feed here)

- Image-hash matching review (exact + perceptual from Sprint 8): reused screenshot listing per admin ("flagged by hash" with cross-submission links)
- Collusion/abuse signal review surface: repeat pairings (F5.5), shared device/IP flags (F3.4), win-trading risk scores from rating deltas
- Report queue: user reports from match chat/banner/report surfaces triage here with action buttons feeding sanctions
- Dead-man-switch: any account with fraud-flag linear escalation auto-limitation (rate-limits, no challenge create) — escalation rules `[owner decision]` at launch

### F12.5 Bulk operations + queues health

- Bulk sanctions, bulk flag clears; empty/error states per Design §8 tables
- SLA-clock visual; pending queue roster assignment storage (queue mechanics for moderators from Delivery Plan staffing plan)

## Design compliance

- Every admin surface follows Design §8 admin components (tables: 40px rows, sticky headers, tabular right nums, hover bg-3, 2px accent left border on selection; bulk bar; board 25/50/100 pagination; full keyboard nav; empty/error states)
- Admin dispute viewer spec literal: two-pane desktop at 360px decision panel, tabbed mobile evidence, SLA clock in header
- Content: voice rules; no shaming; reasons templates localized

## Files and references

| Ref                                                                                                                       | What                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `docs/RAISE PRD v2 Staged Rollout.md` §"Stage 1 user stories → Disputes (moderator) + Admin", §"Rules" (sanctions ladder) | Stories + ladder                                                                     |
| `docs/Technical Architecture RAISE.md` §Modules (moderation/admin), §Security (roles/MFA/audit)                           | Boundaries + security                                                                |
| `docs/Design System RAISE (Stage 1).md` §8 Admin dispute viewer, Tables, §10 accessibility                                | UI specs                                                                             |
| `docs/Delivery Plan RAISE.md` §M3                                                                                         | Scope for this sprint + "moderator can resolve a seeded dispute inside the SLA" exit |
| `docs/UX Flow Spec RAISE (Stage 1).md` Flow 11                                                                            | Admin screens list                                                                   |
| `sprints/sprint-05` F5.5, `sprint-03` F3.4, `sprint-08` F8.2                                                              | The day-one signal collection this sprint consumes                                   |

## Skills, agents, MCP and tools

| Kind  | Resource                                                    | Use for                                                                                               |
| ----- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Skill | `cso` (mandatory) + `best-practices`                        | Admin/moderation security audit: authz matrix, MFA enforcement, audit completeness                    |
| Skill | `audit-context-building`                                    | Pre-audit sweep of the moderation surface assumptions                                                 |
| Skill | `differential-review`                                       | Sanction/ruling apply paths review                                                                    |
| Skill | `spec`                                                      | Ruling decision-error matrix (wrong-ruling recovery path: appeal (F9.2) vs admin rollback documented) |
| Skill | `verify` / `qa` / `test-audit` / `code-review`              | Standard loop                                                                                         |
| Skill | `accessibility`                                             | Tables keyboard nav + viewer tabs                                                                     |
| Skill | `frontend-design`/`design-taste-frontend` + `design-review` | Admin UI (dense but on-token; no "generic admin dashboard" slop — skill warning)                      |
| Skill | `webapp-testing`                                            | Moderator walkthrough: seeded dispute → assign → review evidence → rule w/ confirmation dialog        |
| Skill | `jest-skill`                                                | Bulk-ops/reputation-math unit tests at pace                                                           |
| Agent | `explore`                                                   | Inventory everything report-related across modules for the queue                                      |
| Agent | `general`                                                   | Reputation-threshold modeling from seeded data (design the cutoffs)                                   |
| MCP   | `context7`                                                  | TOTP/otplib docs; BullMQ SLA timers; Zod form schemas for the decision panel                          |
| MCP   | `github`                                                    | Issues for `[owner decision]` thresholds/escalations; PRs                                             |
| Tools | `todowrite` F12.1–F12.5                                     | Tracking                                                                                              |
| Tools | `bash`, `read`/`write`/`edit`, `question`                   | Implementation + decisions                                                                            |

## Testing

- Unit: reputation threshold math vs modeled cases; sanction ladder steps + expiry; escalation auto-limit rules; bulk ops idempotence
- Integration: ruling apply → ratings + reputation + notification + audit — a single atomic sequence (transaction test); appeal requeues
- E2E (moderator walkthrough): seed dispute → assign → open evidence (hash flags visible; screenshots zoomable; chat transcribed) → choose template → confirm dialog → rule applied + notifications + rating delta; SLA clock displays
- Concurrency: two moderators no-double-claim (optimistic assignment)
- Suspended player e2e: cannot create/accept; countdown visibility; sessions revoked on permanent ban

## Audit

- `cso` full pass (mandatory this sprint: admin is crown-jewel surface)
- Audit-log coverage proof: every admin action auditable, sample-traced end-to-end
- Fairness audit: no reputational punishments for offline users; thresholds documented publicly in community rules stubs
- Data minimization: admin search masks phone unless role escalated (PII log rule carries)

## Checklist

- [ ] F12.1 Admin routes role-gated; TOTP MFA on admin accounts; dashboard counters; flag admin; users admin w/ sanction ladder + audit; audit-log viewer; game config admin
- [ ] F12.2 Dispute queue w/ assignment + SLA clock; viewer per Design §8 (evidence/zoom/hash flags/chat transcript/dispute history); decision panel + confirmation dialog seeded effects text
- [ ] F12.3 Reputation engine live + badges everywhere; sanctions enforced + sessions revocation on ban; late-cancel debt resolved
- [ ] F12.4 Fraud surfaces live: reused-image hash flags, collusion signals, report queue, escalation auto-limits `[owner decision]` recorded
- [ ] F12.5 Bulk ops + queue health + empty/error states
- [ ] Moderator-seeded-dispute walkthrough e2e green; PRD M3 exit condition proven
- [ ] Testing green; cso/differential audits closed
- [ ] `ship` close with PR + CHANGELOG
