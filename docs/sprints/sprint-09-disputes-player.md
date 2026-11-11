# Sprint 9 — Disputes (Player Side)

- Milestone: **M2**
- Stage: 1
- Depends on: Sprint 8 (conflict→dispute firing exists), Sprint 7 (chat as evidence)

## Goal

Player-facing dispute lifecycle: open with reason + evidence, shared status tracker, ruling view with the moderator's reason, one appeal. Moderator tooling arrives in Sprint 12; this sprint creates the dispute domain, rows, and player surfaces so moderators have the data they'll work.

## Features

### F9.1 Dispute domain + API

- `Dispute` + append-only `Ruling` tables per TA data model
- Open dispute: reason (categorized), extra evidence (screenshot reuse of F8.2 upload path) - one active dispute per match; auto-opened conflicts (from F8.4) land here too
- Status tracker: shared view for both players (same data, both can see progress: opened → awaiting info → reviewed → ruled)
- Record state transitions with audit log; dispute SLA clock starts at open (clock visible per UX/admin; timer enforcement in Sprint 12 clockwork)

### F9.2 Player dispute UI (UX Flow 6)

- Open dispute sheet: reason picker + free-text detail + upload evidence slots; confirmation before persist; explicit verb button per Design §8
- Status tracker inside match room + inbox links: both sides identical data (UX "Both sides see the same status")
- Ruling view: shows the moderator's recorded reason ("The ruling shows the moderator's reason" — UX doc) + any sanction applied (only visible at ruling time; ladder mechanics in Sprint 12)
- Appeal affordance: exactly once (PRD story), opens an appeal row attached to the dispute; second attempt surfaces the closed state disallowed-cosplay with copy; appeal goes back into the queue in Sprint 12

### F9.3 Ratings/credit holds integration point

- On ruling recorded (by referral to Sprint 12 action), the outbox events `dispute.ruled` fire so ratings (Sprint 10) + future holds (Sprint 13 ledger events on disputes) update — event payloads defined NOW (win/loss/void splits) so downstream consumers are stable
- Chat evidence lock: dispute (and while open) keeps chat evidence snapshotted/read-only for moderators (F7.4 read + retention) — an explicit snapshot view listing messages + screenshots + hashes

### F9.4 Metrics + anti-abuse wiring

- Dispute-rate counters + median-resolution tracking (PRD success metrics: dispute rate <10%, median < 24h) — metrics fields or events emitted at open + rule
- Incentive guard: repeated bad-faith disputers tracked (flags recorded datapoint for reputation penalty in Sprint 12)
- Rate limits: disputes per user/hour; forbidden during prior-open-dispute on same match (validated in code)

## Design compliance

- Chips + timeline dispute tint: dispute color on the process state (Design §2/§7) with icon + label, never color alone
- Content: voice rules; error copy per §9; things say "dispute" not "complaint"
- a11y: tracker is a stepper (screen-readerable sequence), appeal disabled-state explained with helper text per Design button disabled rule

## Files and references

| Ref                                                                                                                                  | What                                                |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `docs/UX Flow Spec RAISE (Stage 1).md` Flow 6                                                                                        | Open/track/ruling/appeal screens                    |
| `docs/RAISE PRD v2 Staged Rollout.md` §"Stage 1 user stories → Disputes", §"Rules", §"Stage 1 acceptance criteria" (disputes bullet) | Stories + acceptance criterion                      |
| `docs/Technical Architecture RAISE.md` §Data model (verification/disputes), §Modules                                                 | Dipesoute/Ruling tables, moderation module boundary |
| `docs/Design System RAISE (Stage 1).md` §2 dispute color, §7 status model, §8 sheets, §9 content                                     | UI + copy                                           |
| `sprints/sprint-08-results-verification.md` F8.4/F8.5                                                                                | Where auto-opened disputes + forfeits originate     |
| `docs/Delivery Plan RAISE.md` §M3                                                                                                    | Moderator SLA direction (for next sprint)           |

## Skills, agents, MCP and tools

| Kind  | Resource                                       | Use for                                                                                        |
| ----- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Skill | `supabase-postgres-best-practices`             | Dispute/Ruling schema (append-only constrain, evidence FK hygiene)                             |
| Skill | `spec`                                         | Dispute state machine + appeal rules documented pre-code                                       |
| Skill | `verify` / `qa` / `test-audit` / `code-review` | Standard loop                                                                                  |
| Skill | `differential-review`                          | Moderation-sensitive authz: who can read what (no cross-player evidence leak to other players) |
| Skill | `accessibility`                                | Stepper + disabled appeal semantics                                                            |
| Skill | `webapp-testing`                               | Dispute open/track e2e                                                                         |
| Agent | `explore`                                      | Outbox event naming conventions from Sprints 6–8                                               |
| Agent | `general`                                      | Metrics event naming catalog + repo pattern check                                              |
| MCP   | `context7`                                     | Drizzle enum transitions; BullMQ SLA timers                                                    |
| MCP   | `github`                                       | PRs; issue for metric catalog                                                                  |
| Tools | `todowrite` F9.1–F9.4                          | Tracking                                                                                       |
| Tools | `bash`, `read`/`write`/`edit`                  | Implementation                                                                                 |

## Testing

- Unit: dispute open validation (one active per match), evidence count caps, single-appeal enforcement, rate limits
- Integration: auto-opened from F8.4 regression; appeal flow → queue-ready state; event emissions on rule with stable payloads (a `dispute.ruled` contract test)
- E2E (two-browser): conflict → dispute auto-open → both players see identical tracker; developer-dispute via manual open with evidence; appeal once blocked on second attempt
- Snapshot/integration: chat evidence snapshot returns identical content as live chat at rule time

## Audit

- `differential-review` on authz: evidence visible only to participants + mods be checked endpoint-by-endpoint
- Audit log coverage: every dispute state change audited (PRD acceptance criterion says "every change is in the audit log")
- Bad-faith dispute metrics; rate-limit documentation
- Content check: reason catalog easy to localize (i18n, doc §9; 30% growth headroom rule)

## Checklist

- [ ] F9.1 Dispute + Ruling tables, open API + status tracker API, audit-log lines at each change
- [ ] F9.2 UI: open sheet, shared tracker, ruling view with moderator reason, single-appeal behavior
- [ ] F9.3 `dispute.ruled` outbox contract defined (incl. void-win/loss splits); chat evidence snapshot endpoint for evidence reads
- [ ] F9.4 Metrics events (dispute rate, resolution clock) emitting; bad-faith dispute datapoints recorded; rate limits documented
- [ ] Testing green incl. two-browser e2e + appeal gate
- [ ] Audit clean (authz proof, audit-log completeness check)
- [ ] `ship` close with PR + CHANGELOG
