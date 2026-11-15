# Sprint 8 audit — upload chain, append-only proof, anti-fraud review

Companion to [sprint-08-results-verification.md](sprint-08-results-verification.md) and [sprint-08-spec.md](sprint-08-spec.md). Every "Proof" entry points at a test that runs in CI, so the claim can be re-checked rather than taken on trust.

## 1. Upload surface (cso / differential pass)

| Control                          | Implementation                                                                                                         | Proof                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Presign lifetime                 | PUT URL valid for 5 minutes, scoped to `quarantine/<uploadId>`                                                         | `uploads.service.ts` `PUT_URL_TTL_SEC`                                                       |
| Type and size bound to signature | `content-type` and `content-length` are signed headers; another type or a larger body is refused by the store          | integration: "presigned URL is bound to the declared type and length"                        |
| MIME allowlist                   | JPEG, PNG and WebP only, checked at presign and again by magic bytes after upload (the declared type is never trusted) | unit: `sniffMime`; integration: "rejects bytes that are not an image"                        |
| SVG / HTML / PDF smuggling       | Rejected by magic-byte sniffing, so no SVG ever reaches storage or a browser                                           | unit: "rejects non-images and lookalikes"                                                    |
| Size                             | 1 MB hard cap at presign (413) and again on read from storage                                                          | integration: "refuses wrong MIME and oversize at presign"                                    |
| Decompression bombs              | sharp `limitInputPixels` 40 MP; animated images rejected                                                               | `image-processing.ts`                                                                        |
| EXIF / GPS stripping             | Server re-encodes with no metadata (orientation baked into pixels first); the client canvas re-encode also drops it    | unit: "strips EXIF including GPS (byte-level proof)"; integration: stored object has no EXIF |
| Private bucket                   | No public access; an unsigned GET returns 403                                                                          | integration: first upload test asserts 403 on the unsigned URL                               |
| Signed reads only                | `GET /uploads/:id/url` returns a 60-second signed URL, for participants, moderators and admins only                    | integration: "signed reads are participant-only"                                             |
| Quarantine never served          | Read URLs are only issued for `ready` uploads and point at `proofs/`, never `quarantine/`                              | `uploads.service.ts` `signedUrl`                                                             |
| Upload after resolution          | Presign and complete both refuse once the match leaves a submittable state, and no row is created                      | integration: "upload after resolution is refused"                                            |
| Ownership                        | A submission can only reference the caller's own `ready` upload for the same match and purpose, used once              | integration: "rejects another player's or another match's screenshot"                        |
| Rate limits                      | presign and complete 20/min, submit 10/min, reads 120/min per user                                                     | controllers                                                                                  |
| Untrusted rendering              | Thumbnails load with `referrerPolicy="no-referrer"` and lazy loading; full images open in a new tab with `noopener`    | `proof-thumbnail.tsx`                                                                        |

Offline queue: the compressed file stays in memory. The upload moves to `offline` when the network drops and resumes on the `online` event. A failure shows retry and remove and never leaves a half-submitted result, because submission is a separate step that needs a `ready` upload.

### Open findings (none critical)

| Severity | Finding                                                                                                             | Plan                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Low      | Orphaned `quarantine/` objects when a client presigns but never calls complete                                      | Add a bucket lifecycle rule (delete `quarantine/` after 1 day) at R2 setup; Setup Guide note added                              |
| Low      | Two simultaneous `complete` calls with identical bytes on two different matches can both pass the exact-reuse check | Rare, and the pHash flag still fires on the second one. A serialisable check or advisory lock on sha256 can follow in Sprint 12 |
| Low      | Rate limits fail open when Redis is down (existing project-wide pattern)                                            | Unchanged here; tracked for Sprint 12 ops hardening                                                                             |
| Info     | Resumable/multipart upload not used                                                                                 | Deliberate: ≤ 300 KB files and the S3/R2 multipart 5 MB part minimum. See spec §7                                               |

## 2. Append-only `result_submissions`

- A `BEFORE UPDATE OR DELETE` trigger raises `restrict_violation`. The only bypass is the transaction-local `raise.allow_purge = 'on'`, which only test fixtures use for DELETE. UPDATE has no bypass at all.
- Proof: integration "ResultSubmission is append-only at the SQL level" runs a raw `UPDATE` and `DELETE` and asserts both are rejected and the row is unchanged.
- One active submission per side: `unique(match_side_id, revision)`, plus a row-locked check in the write path. Idempotency keys are unique, and a replay from the same user returns the original submission.

## 3. Anti-fraud review (Delivery Plan risk: "Verification gaming")

| Cheap cheat                                          | Defence today                                                                                            | Status            | Sprint 12 hardening                                                          |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------- |
| Reuse an old win screenshot on a new match           | Exact SHA-256 match on another match is rejected and the earlier upload is recorded                      | Blocked, tested   | Show "Reused screenshot" with a link in the admin dispute viewer             |
| Re-encode, resize or re-screenshot an old screenshot | pHash distance ≤ 6 is flagged on the upload row                                                          | Flagged, tested   | Surface flags in the viewer; tune the threshold on real data                 |
| Upload the opponent's screenshot as your own         | Upload ownership is enforced, and near-duplicates of the opponent's upload on the same match are flagged | Blocked + flagged | —                                                                            |
| Claim a win the opponent disputes                    | Two-sided verification: conflicting outcomes open a dispute automatically                                | Blocked, tested   | Staffed dispute queue                                                        |
| Agree on the winner but lie about the score          | Scores must mirror exactly or the match is disputed                                                      | Blocked, tested   | —                                                                            |
| Out-of-range or nonsense score                       | Per-model bounds and outcome/score consistency, validated on the server from the shared validator        | Blocked, tested   | —                                                                            |
| Submit a result before the match, or long after      | Gated on agreed start and the 24-hour result window                                                      | Blocked, tested   | —                                                                            |
| Submit twice or change your answer                   | One submission per side, append-only rows, and idempotent retries                                        | Blocked, tested   | Corrections only through the Sprint 9 dispute flow                           |
| False no-show against an opponent who did show       | Opponent gets 24 hours to contest, which turns the claim into a dispute; proof of attempt is required    | Mitigated, tested | Moderators decide forfeits and sanction false claims                         |
| Opponent goes silent to dodge a loss                 | Auto-confirm after 24 hours through a delayed job and a DB sweeper                                       | Blocked, tested   | Reputation debt for repeated silence                                         |
| Both players collude on a fake result (win trading)  | Not detectable from submissions alone; repeat-pairing counters already collected (Sprint 5)              | Open              | Collusion signals: repeat pairings, shared device or IP, rating-gap patterns |
| Photo of a doctored screen                           | Not detectable automatically (OCR and replay checks are out of scope for v1, PRD)                        | Open              | Moderator review; reputation                                                 |
| Same-game screens look alike (pHash false positives) | Flags never block an upload, only inform moderators                                                      | Accepted          | Threshold tuning; compare only the score region later                        |

## 4. Note content policy

The 200-character note goes through `shared/content-filter.ts`: a small blocklist including common Nigerian Pidgin and Yoruba insults, word-boundary matching and normalised character swaps. Sprint 7 chat reuses the same module. A blocked note is refused with "Remove offensive words from the note." Forfeit and no-show submissions store no score.

## 5. Performance

- PRD 5-second criterion: the integration test measures the second submission, through Confirmed, through the `match.confirmed` outbox row. It took 58 ms locally and the assertion is < 5 s. Ratings consume that outbox event in Sprint 10.
- Screenshots are compressed on the client to about 300 KB or less with the longest edge at 1280px (Design §11). The server stores JPEGs of about 1280px and 320px WebP thumbnails for lists.
- The web bundle imports the zod-free `@raise/game-configs/results` subpath, so zod and `games.json` stay out of the route JS.
