# Sprint 13 — Stage 2 Foundations (Ledger, Mock Provider, Identity Tiers)

- Milestone: **M3**
- Stage: 1
- Depends on: Sprint 6 (challenges w/ zero-stake fields), Sprint 8/9 (hold-language events)
- Explicit rule: **no player-facing wallet in Stage 1** — this sprint builds the iron that Stage 2 hangs on.

## Goal

Per PRD "Early technical foundations" + TA §Ledger: double-entry ledger with holds, mock payment provider behind a port, webhook signature + idempotency + reconciliation, identity tiers with stake limits by tier, jurisdiction flags, versioned fee rules + stake bands, and the design-only state machines for withdrawals/refunds/payouts. Plus match's nullable competition id and responsible-gaming fields.

## Features

### F13.1 Ledger core (double-entry, immutable)

- `LedgerAccount` + `LedgerEntry` final shape per TA: immutable entries, idempotency keys, row locking on balance mutation, holds modeled as entries
- Invariant: every account nets to zero per tenant-context composition (nightly check job; flag alert for imbalance — the checks define the alert contract for M4)
- Property tests for invariants (TA: "property-test the invariants" — fuzz transfers/holds)
- Ledger row is spiritually append-only; corrections = reversing entries (never UPDATE/DELETE)
- Operating currency: NGN minor units (money rule); multi-currency support in schema (code + minor units), so global-first futureproof (product doc)

### F13.2 Mock provider + WalletProvider port

- `WalletProviderPort` interface: hold/release/refund/transfer/auth-callback; `MockProviderAdapter` executing the semantics in-DB
- Every challenge in Stage 1 uses the mock with zero stake, but the code path is identical to Stage 2 (adapter swap + per-jurisdiction flag is the whole change; TA "adapter swap plus a flag")
- Fee-schedule version referenced from challenge rows (F6.2); FeeRule versioned table seeded with Stage-2-shaped defaults marked inactive `[owner decision]` on fees closed before Stage 2 (blocked, per PRD open decisions)
- Webhook route for the provider interface (mock): signature verification, idempotent consumption, replay-safe (PRD acceptance: "Replayed mock webhooks cause no duplicate entries")

### F13.3 Identity tiers + stake limits

- Tiers per PRD (verified phone → higher tiers after verified identity/KYC): tier stored + stake caps per tier in a role/tier limits table
- New accounts start low caps (PRD); tier upgrade ends state; nag about future `LimitSetting` responsible-gaming data (limits + self-exclusion fields)
- Fraud-escalation auto-limitations from F12.4 cap stakes at launch-time values — a rule table, not hardcoded

### F13.4 Jurisdiction flags

- Per-state enablement map (feature-flag rows F0.8, keyed per stage+jurisdiction — TA: "flags enable real-money features per jurisdiction" since rules are state-level)
- The `CurrencyAllowed` local United States-style operational note: Nigeria-first launch maps to NGN default enabled
- Compliance-adjacent docs note: license/custody gating left to legal track — no product code assumes it (warnings / open issues from PRD gate list)

### F13.5 Match competition-ready + responsible-gaming data

- `match.competition_id` nullable column + indexes — Stage 3 bracket/plug-in slot (PRD list item)
- `ConsentRecord` per terms versions done in F3.7 — add responsible-gaming `LimitSetting` (limits, self-exclusion) + read/update endpoints (Stage-2 scoped UI not built — fields exist and are gated)

### F13.6 Stage-2 state machines (design artifacts, no runtime)

- Withdrawal, refund, payout state machines drawn as spec diagrams (senior-architect or mermaid) stored in `docs/` (docs-name them under PRD "Designed but not built until Stage 2") with review checklist entries from the legal track language

## Design compliance

- No player UI in this sprint (no wallet screens). Anything player-visible this sprint = zero by design
- Data rules: minor units, currency code everywhere; no floats

## Files and references

| Ref                                                                                                                                       | What                          |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `docs/RAISE PRD v2 Staged Rollout.md` §"Early technical foundations", §"Ledger foundation" story, §"Open decisions"                       | Lists implemented this sprint |
| `docs/Technical Architecture RAISE.md` §Ledger and mock provider, §Stage 2 readiness                                                      | Ledger/flag specs             |
| `docs/Delivery Plan RAISE.md` §M3 + §Build sequence notes ("ledger, provider interface, identity tiers, and jurisdiction flags ship now") | Scope                         |
| `docs/Product Brief RAISE.md` §"Payments"                                                                                                 | Provider-eligibility context  |
| `sprints/sprint-06` F6.2 (fee-schedule references), `sprint-12` (fraud escalation caps)                                                   | Consumer paths                |

## Skills, agents, MCP and tools

| Kind  | Resource                                       | Use for                                                                                                         |
| ----- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Skill | `supabase-postgres-best-practices` (mandatory) | Ledger schema hardening: constraints, FK/idempotency unique indexes, transactional integrity, row locking       |
| Skill | `senior-architect`                             | Ledger ADR + state-machine diagrams (F13.6 deliverable)                                                         |
| Skill | `cso` + `differential-review` (mandatory)      | Ledger path audit (future money!) — race-window hunting, webhook replay, authz on any ledger-adjacent endpoint  |
| Skill | `verify` / `qa` / `test-audit` / `code-review` | Standard loop                                                                                                   |
| Skill | `investigate`                                  | The net-zero drift hunt if invariant fuzz ever flags                                                            |
| Agent | `explore`                                      | Locate every place stakes/holds appear in existing behavior to keep semantics identical for Stage 2             |
| Agent | `general`                                      | Provider-adapter pattern research (comparator against Stripe/Payment-type provider semantics for shape realism) |
| MCP   | `context7`                                     | Drizzle transactions/locking; BullMQ nightly schedule; webhook signature patterns                               |
| MCP   | `github`                                       | Issues for `[owner decision]` fee model artifacts; PRs                                                          |
| Tools | `todowrite` F13.1–F13.6                        | Tracking                                                                                                        |
| Tools | `bash`, `read`/`write`/`edit`                  | Implementation                                                                                                  |

## Testing

- Unit: ledger entry math (signed amounts), hold/release/refund semantics, tier-based stake caps enforcement in validation (reject >cap even though free — proof of wiring), webhook signature verify + replay identity
- Integration: hold→release under settlement; Webhook replay does not double-create; concurrent holds across accounts stay balanced; nightly net-zero check passes; flag kills provider path end-to-end (flag off → mock-only)
- Property/fuzz: random transaction schedules keep every account net-zero — the invariant proof
- Negative: attempt to mutate a LedgerEntry row (SQL trigger test rejects), wrong-currency challenge rejects

## Audit

- `cso`/`differential-review` on the entire ledger + provider adapter (flagged mandatory)
- Ledger ADR review signed off (senior-architect output + reviewer)
- Deployment guard: no provider-adapter registry resolves live providers with Stage-1 flags (test asserts resolve → always mock)
- Open decisions surfaced but never silently defaulted: revenue model/fee tables `[owner decision]` unblocked not closed

## Checklist

- [ ] F13.1 LedgerAccount/LedgerEntry final immutable schema; idempotency + row locking; net-zero nightly check; property tests hitting the invariant
- [ ] F13.2 WalletProviderPort + MockProviderAdapter; challenge→ledger semantics identical for later adapter swap; webhook route with signature/idempotency/replay safety; replay test green
- [ ] F13.3 Identity tiers functional + stake caps by tier enforced in validation; responsible-gaming LimitSetting fields present (no UI required)
- [ ] F13.4 Jurisdiction feature flags per-state live; default Nigeria/NGN mapping; flag toggles respected at runtime
- [ ] F13.5 competition_id column live on matches; F3 consent records closure
- [ ] F13.6 Withdrawal/refund/payout state machines documented in docs/ with PRD gate language
- [ ] Invariant evidence pack archived (fuzz runs + webhook replay + net-zero)
- [ ] Audits pass (cso + differential, zero open critical)
- [ ] `ship` close with PR + CHANGELOG
