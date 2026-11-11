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

- [ ] F8.1 Result submission endpoint append-only + per-game schema validation + active-submission side rule
- [ ] F8.2 Upload pipeline: client compression, presign to private bucket, MIME/size/EXIF/hash checks, resumable where practical; signed-read-only views; Procfile/host notes
- [ ] F8.3 Sheet UI complete with offline/failed/retry/submitted states + doc-correct error copy
- [ ] F8.4 Matching auto-confirm ≤5s incl. rating event handoff; conflict → dispute auto-open; silent-24h auto-confirm timer proven
- [ ] F8.5 No-show (20-min gate, proof required), forfeit + ratings/reputation-debt records; voided reserved for admin
- [ ] Anti-fraud test matrix green (reuse-hash, mismatch, wrong score forced bounds)
- [ ] Testing green incl. two-browser e2e suite
- [ ] Audits pass (cso/differential) with zero open critical findings
- [ ] `ship` close with PR + CHANGELOG
