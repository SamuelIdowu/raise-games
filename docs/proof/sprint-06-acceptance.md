# Sprint 6 acceptance proof — test output

Run: 2026-11-15T12:27Z, branch feat/sprint-6-challenges, CHAOS=1 (Redis container stopped mid-test).

```
✓ state machine (F6.1) > DB transition guard matches the domain table for every pair 395ms
✓ state machine (F6.1) > blocks an illegal transition even from raw SQL 199ms
✓ create (F6.2) > stores zero stake + fee-schedule version and emits challenge.created 147ms
✓ create (F6.2) > 10 concurrent retries with one idempotency key create exactly one challenge 413ms
✓ create (F6.2) > rejects a start in the past and a format from another game 33ms
✓ accept / decline / cancel (F6.3) > 100 parallel accepts: exactly one winner, one match, two sides, no duplicates 2749ms
✓ accept / decline / cancel (F6.3) > a retry by the winner returns the same match (idempotent) 419ms
✓ accept / decline / cancel (F6.3) > a cancelled challenge can never be accepted (stale read race) 79ms
✓ accept / decline / cancel (F6.3) > cancel and accept racing: exactly one of them wins 87ms
✓ accept / decline / cancel (F6.3) > late cancel ends the match and records reputation debt 130ms
✓ accept / decline / cancel (F6.3) > refuses to cancel once results are being reported 75ms
✓ accept / decline / cancel (F6.3) > decline closes a direct challenge but leaves an open one on the board 107ms
✓ accept / decline / cancel (F6.3) > lists direct challenges for their target (forMe) and keeps them off the open board 61ms
✓ accept / decline / cancel (F6.3) > detail includes the rules 33ms
✓ deadlines from row timestamps > expires overdue open challenges only, with an outbox event 125ms
✓ deadlines from row timestamps > moves accepted matches to in_progress at the agreed start (F6.5) 92ms
✓ reports (F6.4) > reports a challenge once per reporter, never your own 70ms
✓ Redis outage (CHAOS=1) > expires a challenge within one minute while Redis is stopped 9157ms
Test Files  1 passed (1)
Tests  18 passed (18)
Duration  25.56s (transform 1.78s, setup 0ms, import 9.49s, tests 15.32s, environment 0ms)
```
