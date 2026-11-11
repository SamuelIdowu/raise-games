# Sprint 3 — Identity & Auth

- Milestone: **M2** (Delivery Plan weeks 3–8)
- Stage: 1
- Depends on: Sprint 0 (auth skeleton, schema), Sprint 2 (onboarding screens to wire)

## Goal

Real accounts: phone OTP signup and login, session/token lifecycle, roles, consent capture, Turnstile on signup, and the day-one abuse-signal collection the PRD requires. This converts the Sprint 0 auth skeleton into the production identity module.

## Features

### F3.1 Phone OTP endpoints

- `POST /auth/otp/request` — normalize phone (+234 local-zero normalization from `packages/schemas`), rate-limit per phone + per IP, 30s resend, Turnstile verify on request when signup
- `POST /auth/otp/verify` — verify code, create-or-login user, issue token pair
- `SmsOtpPort` production adapter (Termii or Twilio `[owner decision]`) + dev mock retained behind `OTP_MOCK_ENABLED` (asserted off in staging/prod)
- Codes: hashed at rest, expiry (5 min), single use, attempt cap (e.g. 5), invalidate on new request
- Audit-log every request/verify/failure (with minimal PII per TA §Security)

### F3.2 Token and session lifecycle

- 15-minute JWT access tokens; rotating refresh stored per device session (`sessions` table with device metadata + push token placeholder)
- Refresh rotation with reuse detection (stolen refresh revokes the chain); logout + logout-all; idle revocation when a user gets a sanction
- Auth guard + current-user decorator; ownership checks used across modules come from here

### F3.3 Roles and authz

- Roles: player now; moderator/admin roles exist in the enum (allotted in Sprint 12)
- Role guard; ban/suspension check middleware (sanctions table present, populated in Sprint 12)
- Consent enforcement: blocking ToS-acceptance required before Play (ConsentRecord per terms version — PRD foundations list)

### F3.4 Turnstile + signup hygiene

- Turnstile server-side verification wiring on signup-shaped requests
- Duplicate-account signals collected from day one (PRD): phone, device fingerprint, IP stored on identity events (consumed by fraud signals in Sprint 12)

### F3.5 Jurisdiction + onboarding data

- State of residence captured at signup (plain-language, UX doc decision from Sprint 2) → user.jurisdiction_state
- Age-verification status + KYC status fields present (Stage 2), defaults set
- Identity tier default (verified-phone) recorded — tiers expanded in Sprint 13

### F3.6 Auth UI finish

- Wire Sprint 2 onboarding to the real API: OTP request/verify flow, resend countdown, paste support, error states per Design §8 (Input/OTP specs)
- Session persistence in web; authed fetch via generated api-client
- Signed-out redirects; session-expiry handling mid-app (re-auth prompt, never data loss of unsent result)

### F3.7 Consent records

- Terms/privacy version table + acceptance row per user; an endpoint to re-accept on new versions (legal track supplies copy — stub text flag `[legal]`); UI gate

## Design compliance

- OTP + error states per Design §8 (loss-colored border + icon + text; plain-text errors; never color alone)
- Content voice per Design §9 ("Verify your phone" not "Authenticate"); Pidgin nowhere in auth
- WCAG: OTP auto-advance focus management, `aria-live` resend timer, visible focus

## Files and references

| Ref                                                                                                                   | What                                                |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `sprints/sprint-00-setup-foundations.md` F0.7                                                                         | Skeleton this sprint productionizes                 |
| `docs/Technical Architecture RAISE.md` §Security                                                                      | OTP/JWT/refresh/argon2id/MFA decisions              |
| `docs/RAISE PRD v2 Staged Rollout.md` §"Early technical foundations", §"Stage 1 user stories → Accounts and profiles" | Jurisdiction/tier/consent fields; signup user story |
| `docs/UX Flow Spec RAISE (Stage 1).md` Flow 1                                                                         | Onboarding + state-of-residence ask                 |
| `docs/Design System RAISE (Stage 1).md` §8 Input/OTP, §9 Content, §10 Accessibility                                   | Component + copy + a11y specs                       |
| `packages/schemas`                                                                                                    | Phone normalization + OTP DTOs                      |

## Skills, agents, MCP and tools

| Kind  | Resource                              | Use for                                                                                            |
| ----- | ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Skill | `supabase-postgres-best-practices`    | Before sessions/auth tables changes (indexes on phone, rotation columns)                           |
| Skill | `cso` + `differential-review`         | Mandatory security reviews: token chain, rate limits, reuse detection, PII logging                 |
| Skill | `best-practices`                      | Security baseline adjustments                                                                      |
| Skill | `audit-context-building`              | Pre-audit context on identity module assumptions                                                   |
| Skill | `verify` / `qa`                       | Per block                                                                                          |
| Skill | `webapp-testing`                      | Drive real signup in browser (mock OTP provider stub in staging)                                   |
| Skill | `code-review` / `review`              | PR ritual                                                                                          |
| Skill | `test-audit`                          | Prune low-value auth tests before close                                                            |
| Skill | `investigate`                         | Any flaky OTP/rate-limit bug — root cause, not patch                                               |
| Agent | `explore`                             | Find guard/interceptor patterns to extend                                                          |
| MCP   | `context7`                            | NestJS guard/interceptor docs, JWT best practice, BullMQ rate limiting (throttler), Turnstile docs |
| MCP   | `github`                              | Issues for `[owner decision]` SMS vendor; PRs; secret-scanning the auth diff                       |
| Tools | `todowrite` F3.1–F3.7                 | Tracking                                                                                           |
| Tools | `bash`, `read`/`write`/`edit`, `grep` | Implementation                                                                                     |
| Tools | `websearch`                           | Termii vs Twilio pricing/coverage research feeding the decision                                    |

## Testing

- Unit: phone normalization edge cases (table-driven: `+234`, `0803…`, spaces, dashes); code hashing/expiry/attempt-cap; token expiry parsing; rotation + reuse-detection logic
- Integration: OTP request→verify→refresh→rotate→logout cycle against compose Postgres; rate-limit counts actually applied; consent gate blocks Play
- Concurrency: parallel OTP verify — exactly one session chain created
- E2E (Playwright): signup → OTP → home with new user; re-login; logout; expired-access auto-refresh mid-session
- Abuse sim: scripted >5 verify attempts → locked; resend spam → throttled
- Staging proof: real SMS path `[owner decision]` or gate with allow-list numbers (document the allow-list in ops runbook)

## Audit

- `cso` + `differential-review` on the whole identity module (mandatory)
- Rate-limit inventory per endpoint documented (phone, IP, global)
- Log scrubbing check: no full phone number or OTP in any log line (grep the bundled logger output)
- Turnstile placement verified; mock adapter dead-code path proven unreachable in staging build (flag assert + test that fails if enabled by env)
- Session revocation test: an admin-class suspension (fixture) revokes sessions instantly

## Checklist

- [ ] F3.1 Request/verify OTP live; codes hashed + expiring + capped; rate limits per phone+IP; audit log entries
- [ ] F3.2 Access/refresh with rotation + reuse detection; logout, logout-all; revocation on suspension
- [ ] F3.3 Guard + roles; sanction gate; consent gate blocks Play
- [ ] F3.4 Turnstile verified server-side; duplicate-account signals recorded
- [ ] F3.5 Jurisdiction state, KYC/age fields, identity tier default present on `users`
- [ ] F3.6 UI wired: OTP cells + countdown + paste; session expiry prompts; api-client authed calls
- [ ] F3.7 Consent version + record table; re-accept endpoint; gate UI
- [ ] Testing block green incl. concurrency + abuse sims
- [ ] Audit block: cso + differential-review findings closed or filed; log PII scrub verified
- [ ] SMS vendor decided `[owner decision]`, staging SMS path (or documented allow-list) works
- [ ] `ship` close: merged PR, CHANGELOG, checklist ticks committed
