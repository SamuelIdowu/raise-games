# Terms of Service amendment stub — match chat `[legal]`

Status: **draft for legal review**. Not live. Sprint 7, F7.4.

## Why

The Technical Architecture says: "Admins can read match chats as dispute evidence, and the
terms must say so." Sprint 7 ships that capability (`GET /admin/matches/:id/chat`,
moderator/admin only, every read written to the audit log). The terms must disclose it
before launch.

## Proposed clause (plain-language draft)

> **Match chat.** Each match has a chat between the two players. Messages are stored by
> RAISE. Our moderators and administrators may read a match chat when reviewing a dispute,
> a report, or suspected cheating or abuse, and may use it as evidence when deciding the
> outcome. Each such review is logged. Messages are checked automatically for abusive
> language, contact details and payment requests, and flagged messages may be reviewed.
> A match chat closes to new messages 72 hours after the match ends; it is kept after
> that for dispute review.

## Open points for legal / owner

- Retention period for chat messages after lock (PRD "Open decisions"; currently no
  deletion). Needs a number and a deletion job.
- Whether automated flagging needs separate disclosure under the NDPA (Nigeria Data
  Protection Act 2023) as automated processing.
- The in-app copy already says "Moderators can read this match chat when reviewing
  reports and disputes" in the report sheet; keep it consistent with the final clause.
- Bump `tosVersionAccepted` and re-consent flow (Sprint 3 consent module) when published.
