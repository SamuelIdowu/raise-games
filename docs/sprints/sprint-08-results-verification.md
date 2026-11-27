# Sprint 8 — Result Submission & Two-Sided Verification

- Milestone: **M2**
- Stage: 1
- Depends on: Sprint 6 (matches), Sprint 7 (room/gateway), Sprint 4 (game result schema)

## Goal

Two-sided result submission with screenshot proof, matching auto-confirm, conflicting → dispute, silence → auto-confirm, and no-show/forfeit. This is the anti-fraud-critical sprint (PRD risk list): everything hardened to make cheating expensive from day one (image hashing pipeline lands here, consumers in Sprint 12).

## Features

### F8.1 Result submission (append-only)

- `ResultSubmission` table append-only (TA: no updates; correction = a new submission under dispute flow)
- Payload: outcome (won/lost/draw-if-game-allows/no-show), score (steppers per `game-configs` result schema), note ≤200 chars, proof screenshot attachment
- Validation: per-game result schema from config (F4.1); the score model validates (document allowed key names)
- One active submission per side until the match resolution; conflicts handled via dispute

### F8.2 Screenshot upload (the robust path)

- Client capture via camera/gallery → client-side compression to ≤ ~300 KB, longest edge 1280px (Design §11)
- Presigned URL upload to private R2/S3 bucket (`FileStoragePort` adapter — TA), private + signed reads
- Server checks: MIME/size allowlist, EXIF stripping on storage write or download intent (design note: EXIF must be stripped — server-side strip is accepted), image hash computed (exact + perceptual) stored on `Upload` row
- Upload states in UI: uploading, offline (queue + retry), failed (retry), submitted (Design §8 submission sheet)
- Screenshots inspected via signed URLs only; opt-out never (design §6: untrusted content)
- Resumable upload support via multi-part/chunked presign where practical (UX shell performance budget notes resumability for flaky networks)

### F8.3 Submission flow UI (Design §8 sheet)

- Outcome selector, score steppers driven by game config, screenshot upload (progress/retry/remove), summary line honoring the plain-language auto-confirm copy (UX open decision resolved in Sprint 2 findings)
- Errors per Design content rules ("Could not upload the screenshot. Check your connection and try again.")
- Compute-cost capture: emission of submission count/side for metrics (PostHog events)

### F8.4 Confirmation logic + auto-confirm

- When both sides submit matching outcomes+scores → **auto-confirm**: System event writes match as Confirmed; ratings update piggyback via outbox (Sprint 10); PRD criterion: auto-confirm + rating update within 5s (achievable eventually; measure, keep under threshold in test)
- Conflicting submissions → `Disputed` auto-open (dispute track; Sprint 9 builds UI; a Dispute row + system message in chat)
- Opponent silent for 24h (confirmation window, PRD) and has not disputed → timer-based auto-confirm via deadline job + sweeper (BullMQ delayed + sweeper both — reliability pattern from F6.3)
- Notification events on submission, confirm-player-needed, auto-confirm

### F8.5 No-show / forfeit

- No-show claim permitted 20 min after agreed start (PRD rule) with proof of attempt (equivalent screenshot-field type); claim triggers opponent confirmation window + dispute track via moderators for forfeit decision (Sprint 12 actions on it)
- `Forfeited` side-exit state wired: forfeit outcome grades into ratings + reputation (debt record) — policy table documented
- Voided state reserved for admin use (Sprint 12)

## Design compliance

- Result sheet is doc-specified (§8) — outcome rows, steppers, upload UI, note, summary; offline/touch states
- Confirmed summary screen: rating change + rank tier + count-up motion per doc (respects reduced motion; count-up utility from F1.6)
- Status: Awaiting-confirmation accent when the viewer must act; Win/Loss tags appear only on finished matches

## Files and references

| Ref                                                                                                                                | What                                  |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `docs/RAISE PRD v2 Staged Rollout.md` §"Rules", §"Stage 1 user stories → Results and verification", §"Stage 1 acceptance criteria" | Timings, match/auto-confirm criterion |
| `docs/Technical Architecture RAISE.md` §Data model (Play/Ratings), §Uploads (presigned/EXIF/hash), §Background jobs                | Tables, image treatment, jobs         |
| `docs/Design System RAISE (Stage 1).md` §8 Result submission sheet, §11 image budget, §6 untrusted content                         | Component + spec                      |
| `docs/UX Flow Spec RAISE (Stage 1).md` Flow 5                                                                                      | Waiting/confirm/summary screens       |
| `packages/game-configs`                                                                                                            | Score schema per game                 |
| `sprints/sprint-02-ux-prototype.md` F2.6                                                                                           | Prototype                             |

## Skills, agents, MCP and tools

| Kind  | Resource                                       | Use for                                                                                                                                     |
| ----- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Skill | `supabase-postgres-best-practices`             | Append-only constraints (no UPDATE triggers), file/hash table shape                                                                         |
| Skill | `differential-review` + `cso`                  | Upload surface audit: MIME/size/expiry-signed URLs/EXIF stripping proof (fraud hot-spot)                                                    |
| Skill | `spec`                                         | Auto-confirm/conflict matrix formalized before code (states × submission combinations)                                                      |
| Skill | `verify` / `qa` / `test-audit` / `code-review` | Standard loop                                                                                                                               |
| Skill | `webapp-testing`                               | Upload screenshots via staged URLs; file upload e2e; fake file                                                                              |
| Skill | `emil-design-eng`                              | Upload progress/feel; count-up signature finish                                                                                             |
| Agent | `explore`                                      | Locate presign/adapter seams + compose MinIO (add local MinIO container to Compose for R2-compatible tests — Setup Guide compose extension) |
| Agent | `general`                                      | Client compression/on-device capture baselines + perceptual-hash library eval (sharp + pHash)                                               |
| MCP   | `context7`                                     | R2/S3 presign docs; `sharp` EXIF strip API; perceptual hash JS library docs                                                                 |
| MCP   | `github`                                       | PRs; issues for any new decisions surfaced                                                                                                  |
| Tools | `todowrite` F8.1–F8.5                          | Tracking                                                                                                                                    |
| Tools | `bash`, `read`/`write`/`edit`                  | Implementation                                                                                                                              |

## Testing

- Unit: result-schema validator per game (consistent names); hash computation deterministic; min-length EXIF-strip proof on bytes; score bounds; note length; outcome matrix (win/loss pairs → each combination resolution table)
- Integration: matching submissions → Confirmed via job; conflict → Dispute row + chat system message; 24h silent auto-confirm via time-travel fixture + sweeper; screenshot reuse across two matches fails with hash flag
- E2E (two-browser): win/loss pair auto-confirms → confirmed summary with count-up; conflict pair → dispute opened; no-show claim flow with proof-required gate enforced
- Rejection e2e: over size limit, wrong MIME, upload after resolution (no broken state left behind)
- Performance: p95 attachment upload handling within Design §11 budget (≤300 KB client compressed bytes)
- 5s criterion: submission→confirmed rating update measured (must stay < 5s in test env; if job queuing makes it flaky, investigate and document fix)

## Audit

- `cso`/`differential-review` full pass on upload chain (presign lifetime, signed-read only, offline queue montage proof, EXIF byte dump asset)
- Append-only constraints verified at SQL level (UPDATE/DELETE rejected by trigger on ResultSubmission)
- Anti-fraud review vs Delivery Plan "Verification gaming" risk item: attempt every cheap cheat (re-screenshot, wrong-score bluff etc.) documented with current defense status + expected Sprint 12 hardening
- Content policy on the 200-char note (profanity filter reuse); no-score proof fields for forfeit

## Checklist

- [x] F8.1 Result submission endpoint append-only + per-game schema validation + active-submission side rule
- [x] F8.2 Upload pipeline: client compression, presign to private bucket, MIME/size/EXIF/hash checks; signed-read-only views. **Audit 2026-11-20:** uploads retry whole files (not resumable/chunked) and no host notes exist (A8)
- [x] F8.3 Sheet UI complete with offline/failed/retry/submitted states + doc-correct error copy
- [x] F8.4 Matching auto-confirm ≤5s incl. rating event handoff; conflict → dispute auto-open; silent-24h auto-confirm timer proven
- [x] F8.5 No-show (20-min gate, proof required), forfeit + ratings/reputation-debt records; voided reserved for admin
- [x] Anti-fraud test matrix green (reuse-hash, mismatch, wrong score forced bounds)
- [x] Testing green incl. two-browser e2e suite
- [x] Audits pass (cso/differential) with zero open critical findings
- [ ] `ship` close with PR + CHANGELOG

## Integration with Sprints 6–7 (2026-11-15)

Sprint 8 was started before Sprint 7 landed; it was rebased onto Sprints 6 and 7:

- **One match view.** `GET /matches/:id` returns the Sprint 7 hub view extended with the result
  fields this sprint needs (format result schema and proof, deadlines, per-player submission,
  `nextAction`, outcome). The result write path lives in `ResultsService`
  (`apps/api/src/matches/results.service.ts`); `MatchesService` owns reads and the room code.
- **Chat tables.** The minimal `conversations`/`messages` tables this sprint created are replaced
  by Sprint 7's (partitioned messages); `postSystemMessage` writes into those. The room re-reads
  chat on every state change, so the dispute system message appears live.
- **Match room.** The thin `/matches/[matchId]` room is removed; its result actions (submit,
  no-show, confirm, waiting, disputed, confirmed summary) now render inside the Sprint 7 hub at
  `/matches/[id]` (`components/match/result-actions.tsx`).
- **Migrations.** Renumbered to `0007_sprint8_results` (after `0005_state_guards` and
  `0006_sprint7_messaging`), keeping the hand-written append-only trigger and value checks.
- **State guards.** All transitions here are legal under the Sprint 6 DB transition guard.
- **Fixed while integrating:** the shared `Sheet` hard-coded `id="sheet-title"`, so with the nav
  drawer mounted every sheet was announced as "Navigation"; `@raise/game-configs` did not export
  `games.json`, which broke `db:seed` once the package gained an `exports` map.

## Status notes

- Two-browser e2e (`apps/web/e2e-app`, results + match-room specs) runs in CI (`E2E` job): 8/8
  green on PR #9. The local machine could not hold the full stack in memory.
