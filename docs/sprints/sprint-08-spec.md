# Sprint 8 spec — result submission, verification, no-show

Companion to [sprint-08-results-verification.md](sprint-08-results-verification.md). Written before code, as the sprint plan asks (`spec` skill: auto-confirm and conflict matrix formalized first). Rules come from the PRD "Rules" section. Where the PRD is silent, the decision is marked **[decision]** so the owner can overrule it.

## 1. Timings (PRD rules)

| Rule                | Value                      | Source         | Enforced by                                                            |
| ------------------- | -------------------------- | -------------- | ---------------------------------------------------------------------- |
| First submission    | within 24h of agreed start | PRD            | `POST /matches/:id/result` rejects with 409 after `result_deadline`    |
| Earliest submission | at agreed start            | **[decision]** | 409 "This match has not started yet"                                   |
| No-show claim       | from agreed start + 20 min | PRD            | `POST /matches/:id/no-show` rejects with 409 before the gate           |
| Confirmation window | 24h after first submission | PRD            | `confirmation_deadline` on the match row; BullMQ delayed job + sweeper |
| Sweeper interval    | 30s                        | F6.3 pattern   | deadlines land ≤ 1 min after due, including after a Redis restart      |

Agreed start is `challenges.starts_at`. Deadlines are stored on the `matches` row (TA: "Deadlines are stored on the row").

## 2. Score model and key names

The score payload is always from the submitter's point of view:

```json
{ "self": 3, "opponent": 1 }
```

Allowed keys are exactly `self` and `opponent`, both integers. Any other key is rejected. The opponent's mirrored submission therefore has `self` and `opponent` swapped.

| `scoreModel` | Better is | Bounds (inclusive) | Stepper label |
| ------------ | --------- | ------------------ | ------------- |
| `goals`      | higher    | 0 – 99             | Goals         |
| `kills`      | higher    | 0 – 999            | Kills         |
| `points`     | higher    | 0 – 9,999          | Points        |
| `placement`  | lower     | 1 – 100            | Placement     |

Outcome versus score consistency (tiebreak rules say "if equal, the result stands as submitted"):

- `win`: own score is better than or equal to the opponent's.
- `loss`: own score is worse than or equal to the opponent's.
- `draw`: scores are equal, and only when the format has `drawAllowed: true`.

The validator lives in `packages/game-configs` so the API and the web steppers share one source of truth.

## 3. Submission kinds

| Kind           | Who                                                           | Outcome stored        | Proof                                                                                    |
| -------------- | ------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------- |
| `result`       | either side                                                   | `win`, `loss`, `draw` | Screenshot if the format's `requiredProof` includes `screenshot` (all launch formats do) |
| `no_show`      | either side, from start + 20 min                              | `no_show`             | Screenshot of the attempt, always required                                               |
| `confirmation` | the side that has not submitted, agreeing with the other side | mirrored outcome      | None (agreeing with proof already on file)                                               |

`result_submissions` is append-only (a database trigger rejects UPDATE and DELETE). There is one active submission per side (`unique(match_side_id, revision)`, revision 1 in Sprint 8). Corrections are a new revision under the Sprint 9 dispute flow.

## 4. Resolution matrix (both sides have submitted)

Rows are the first submission and columns are the second. "Match" means mirrored scores (`a.self = b.opponent` and `a.opponent = b.self`).

| First \ Second | `result` win                      | `result` loss                            | `result` draw                     | `no_show` | `confirmation`            |
| -------------- | --------------------------------- | ---------------------------------------- | --------------------------------- | --------- | ------------------------- |
| `result` win   | Disputed                          | Confirmed if match, else Disputed        | Disputed                          | Disputed  | Confirmed                 |
| `result` loss  | Confirmed if match, else Disputed | Disputed                                 | Disputed                          | Disputed  | Confirmed                 |
| `result` draw  | Disputed                          | Disputed                                 | Confirmed if match, else Disputed | Disputed  | Confirmed                 |
| `no_show`      | Disputed                          | Forfeited (claimant wins) **[decision]** | Disputed                          | Disputed  | Forfeited (claimant wins) |

- **Confirmed**: the match is `confirmed`, the winner is the `win` side (none on a draw), and `match.confirmed` goes to the outbox with `via: 'agreement'`. Ratings consume it in Sprint 10.
- **Disputed**: the match is `disputed`, a `disputes` row is written with `source = 'auto_conflict'`, a system message is posted in the match chat, and `dispute.opened` goes to the outbox. The Sprint 9 UI picks it up.
- **Forfeited**: the match is `forfeited` and the non-claimant forfeits. `match.forfeited` and `reputation.debt` go to the outbox.
- A `confirmation` is only accepted while the other side has a submission and this side has none, so it can never come first.

## 5. Timeout matrix (confirmation window expires with one submission)

| Only submission | Result                                                                               |
| --------------- | ------------------------------------------------------------------------------------ |
| `result`        | Confirmed exactly as submitted, `via: 'auto_timeout'`                                |
| `no_show`       | Forfeited: the silent side forfeits (PRD: claim, then opponent window, then forfeit) |

The state change is guarded (`status = 'awaiting_confirmation' AND confirmation_deadline <= now()`), so a late second submission and the timer can't both win.

## 6. Forfeit policy table

| Event                                    | Ratings (Sprint 10 consumer)                                     | Reputation                                                  |
| ---------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| No-show claim not contested (timeout)    | Graded as a loss for the forfeiting side, a win for the claimant | `reputation.debt` for the forfeiting side, reason `no_show` |
| No-show claim conceded (loss or confirm) | Same as above                                                    | Same as above                                               |
| No-show claim contested                  | Nothing until the moderator rules (Sprint 9/12)                  | Nothing until ruling                                        |
| Voided                                   | Never graded. Admin only (Sprint 12)                             | None                                                        |

## 7. Upload pipeline

1. `POST /uploads/presign` with `{ matchId, purpose, contentType, sizeBytes }`. The server checks that the caller is a participant, the match accepts submissions, MIME is in the allowlist (`image/jpeg`, `image/png`, `image/webp`) and size ≤ 1 MB. It writes an `uploads` row in `pending` and returns a presigned PUT URL for `quarantine/<id>`, valid for 5 minutes and signed for exactly that content type and length.
2. The browser compresses first (longest edge 1280px, about 300 KB or less, re-encoded through canvas, which also drops EXIF), then PUTs the file to the presigned URL.
3. `POST /uploads/:id/complete`: the server reads the object, sniffs the magic bytes (the declared type is not trusted) and decodes it with sharp. It applies the EXIF orientation, then strips all metadata on re-encode, caps the longest edge at 1280px, and writes `proofs/<id>.jpg` plus a 320px `proofs/<id>_thumb.webp`. It deletes the quarantine object.
4. Hashes: SHA-256 of the original bytes (exact) and a 64-bit DCT perceptual hash (pHash) of the decoded image.
   - Exact SHA-256 match with an upload on another match: rejected (409 "This screenshot was already used for another match."), with the earlier upload id recorded on the row.
   - pHash Hamming distance ≤ 6 to an upload on another match, or to the opponent's upload on the same match: accepted but flagged (`similar_upload_id`, `similar_distance`). Sprint 12's admin dispute viewer consumes the flags.
5. Reads only through `GET /uploads/:id/url`: a signed GET URL valid for 60 seconds, for match participants and moderators or admins. The bucket stays private.

Resumable or multipart upload: not used. At ≤ 300 KB a single PUT finishes in a few seconds on throttled 3G, and multipart has a 5 MB minimum part size on S3 and R2. Flaky networks are covered by the client offline queue (the file is kept in memory and retried when `online` fires) and an explicit retry. **[decision]**

## 8. Events (outbox, consumed by Sprint 10 and 11)

`result.submitted` (needs confirmation, recipient is the opponent), `noshow.reported`, `match.confirmed` (`via: agreement | auto_timeout`), `dispute.opened`, `match.forfeited`, `reputation.debt`.

## 9. Stubs for Sprint 7 (owner chose to build Sprint 8 first)

- `conversations` and `messages` tables are created here with the minimum columns. Sprint 8 only writes system messages. Sprint 7 adds the gateway, user messages, locking and the chat UI.
- `/matches/[matchId]` is a thin match room: header, opponent, one primary action, result sheet and confirmed summary. Sprint 7 replaces it with the full timeline and chat layout.

## 10. Not in Sprint 8

Rating computation (Sprint 10: the confirmed summary shows the current rating and the rating change once Sprint 10 emits it), the dispute UI and appeals (Sprint 9), moderator forfeit decisions and voiding (Sprint 12), notification delivery (Sprint 11).
