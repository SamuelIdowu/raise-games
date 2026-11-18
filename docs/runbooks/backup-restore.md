# Runbook: backup and restore

Owner: on-call engineer. Target (TA §Backups): point-in-time recovery with a **one-day recovery target**. PRD acceptance: "a backup restore has been tested".

## What protects the data

| Layer                  | What                                                                                 | Where                                                       |
| ---------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Point-in-time recovery | Continuous WAL archiving by the managed Postgres host, retained 7 days or more       | Managed host (chosen in Sprint 0 F0.10/F0.11) **[staging]** |
| Logical backup         | Nightly `pg_dump --format=custom`, kept 30 days in a separate account or bucket      | Host scheduler **[staging]**                                |
| Drill                  | `infra/restore-drill.sh`: dump → restore into a fresh database → verify → drop       | CI on every build; run by hand before the beta              |
| Screenshots            | R2 bucket with object versioning; `quarantine/` expires after 1 day (Sprint 8 audit) | Cloudflare **[staging]**                                    |

Redis holds only rebuildable state (queues, rate limits, socket fan-out). After losing Redis the API recovers by itself: job schedulers are re-registered at boot, the outbox relay re-drives undelivered events from Postgres, and the challenge-expiry sweeper catches missed timers.

## The drill (any environment)

```bash
SOURCE_DATABASE_URL=postgres://USER:PASS@HOST:5432/DB infra/restore-drill.sh
```

It verifies more than "the restore ran":

- Every table has the same row count.
- Every trigger survived. The append-only and ledger-balance guards are triggers, so a restore that drops them loses integrity guarantees without any error.
- The same migrations are recorded.
- The restored ledger nets to zero, and cached balances match the entries.

A failure exits non-zero with the mismatches listed. Record each manual run in the log below.

## Point-in-time recovery (production incident)

1. **Declare** a sev1 in the incident channel. Name an incident lead and a scribe. Note the time of the bad event (bad migration, mass delete, corruption) as precisely as logs allow.
2. **Stop writes**: scale the API to zero, or turn on maintenance mode at Cloudflare, so nothing new lands on the damaged database.
3. **Restore** on the managed host to a new instance at a point just before the bad event. Never restore over the live instance.
4. **Verify** the new instance: run `restore-verify.ts` against it, with the damaged database as the source to see what differs and the last good backup as a sanity reference. Spot-check the latest confirmed matches and open disputes in the moderator console. The ledger check must pass.
5. **Cut over**: point `DATABASE_URL` at the new instance and start the API. The outbox relay re-delivers anything not yet processed. Consumers are idempotent, so replays are safe.
6. **Reconcile** the gap between the restore point and the stop: list outbox events and uploads created in that window from the old instance, and decide case by case with the product owner. Players get an inbox notice if a result they saw was rolled back.
7. **Postmortem** within 5 working days.

## Drill log

| Date | Environment                        | Size          | Restore time  | Result                      | By  |
| ---- | ---------------------------------- | ------------- | ------------- | --------------------------- | --- |
| (CI) | test database after the full suite | see CI output | see CI output | runs on every build         | CI  |
| —    | staging PITR                       | —             | —             | **pending staging (F0.11)** | —   |
