# RAISE — Sprint Plan (Stage 1)

Index of every sprint required to deliver Stage 1 (Founding Players) per `RAISE PRD v2 Staged Rollout.md` and `Delivery Plan RAISE.md`. Sprint 0 is setup; sprints 1–17 cover build, hardening, beta, and launch.

## How this folder works

- Each sprint file is a self-contained work order. Execute them roughly in order; sprints may overlap in weeks as the Delivery Plan allows (e.g., Sprint 1 runs parallel with 0, sprints 3+ overlap M1/M2).
- The working agent must: read the sprint file, read every referenced doc section before coding, implement the features (IDs `F{n}.{x}`), run the testing block, run the audit block, then tick the checklist boxes in the sprint file itself (commit checkbox updates with the work).
- Every checklist item answered `- [x]` must be justifiable: a test that ran, a command that executed, or a PR where the feature landed.
- Where a doc says "proposed, confirm with owner", the agent must stop and surface the open decision (use the `question` tool, or file a GitHub issue) before finalizing design/code. These are tagged `[owner decision]`.
- **Design compliance is strict**: UI sprints must follow `docs/Design System RAISE (Stage 1).md` (tokens, components, motion, content rules) and `docs/UX Flow Spec RAISE (Stage 1).md`. Any deviation is a checklist-blocking note.

## Sprint index

| Sprint | File                                | Milestone     | Content                                                                                   |
| ------ | ----------------------------------- | ------------- | ----------------------------------------------------------------------------------------- |
| 0      | `sprint-00-setup-foundations.md`    | M0 (wk 1–2)   | Monorepo, CI, environments, auth skeleton plan, schema foundations, staging hello-world   |
| 1      | `sprint-01-design-system.md`        | M1 (wk 1–4)   | Design tokens package, theme, core component library, Storybook, a11y                     |
| 2      | `sprint-02-ux-prototype.md`         | M1 (wk 1–4)   | App shell, all Stage 1 flow prototypes, player testing (8–10 players), close UX decisions |
| 3      | `sprint-03-auth-identity.md`        | M2 (wk 3–8)   | Phone OTP auth, sessions, roles, consent, Turnstile, abuse signals                        |
| 4      | `sprint-04-games-profiles.md`       | M2            | Game config, formats, game profiles, in-game IDs                                          |
| 5      | `sprint-05-discovery-board.md`      | M2            | Play tab, challenge board, cards, filters, player search                                  |
| 6      | `sprint-06-challenges.md`           | M2            | Challenge lifecycle, state machine accepts, deadlines, concurrency                        |
| 7      | `sprint-07-match-room-chat.md`      | M2            | Match room hub, real-time gateway, match chat                                             |
| 8      | `sprint-08-results-verification.md` | M2            | Result submission, screenshots, two-sided confirm/auto-confirm                            |
| 9      | `sprint-09-disputes-player.md`      | M2            | Player-side disputes: open, track, ruling, appeal                                         |
| 10     | `sprint-10-ratings-leaderboards.md` | M2            | Elo engine, rating events, leaderboards, profile stats                                    |
| 11     | `sprint-11-notifications-inbox.md`  | M2            | Outbox fan-out, in-app/web push/email, inbox, preferences                                 |
| 12     | `sprint-12-trust-operations.md`     | M3 (wk 8–11)  | Admin dashboard, dispute queue, sanctions, reputation, fraud signals, hashing             |
| 13     | `sprint-13-stage2-foundations.md`   | M3            | Ledger + mock provider, identity tiers, jurisdiction flags, fee rules, Stage 2 data       |
| 14     | `sprint-14-restricted-dms.md`       | M3            | Restricted DMs + friend requests (gated on owner), block/mute/report                      |
| 15     | `sprint-15-hardening.md`            | M4 (wk 11–14) | Performance, load test, security review, observability, alerts, backup restore            |
| 16     | `sprint-16-closed-beta.md`          | M4            | Beta onboarding of 100–200 players, metrics dashboard, adversarial testing                |
| 17     | `sprint-17-launch.md`               | M5 (wk 15)    | Seeded ladders, moderator staffing, launch dashboards, public launch Nigeria              |

Gates after Stage 1 (Stage 2/3/4) are out of scope for this folder; see PRD §"Staged rollout and gates".

## Standard tooling legend (referenced as "the legend" in every sprint)

### Agents (subagent via Task tool)

| Agent     | Use for                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------- |
| `explore` | Read-only codebase search: find existing patterns/files before writing new ones; answer "where is X?" quickly |
| `general` | Multi-step research/implementation subtasks that need bash + file tools in parallel                           |

> Launch agents concurrently when independent. Tell each agent clearly whether it is research-only or should write code, and what to return.

### MCP servers

| MCP                                          | Use for                                                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `context7` (resolve-library-id → query-docs) | Every sprint that touches a library: Next.js, NestJS, Drizzle, BullMQ, Tailwind, socket.io, etc. Fetch _before_ writing API code — training data may be stale |
| `github`                                     | Issues per sprint, PRs, branch protection, code search across the repo, review comments, requesting Copilot review before human review                        |

### Tools (built-in)

| Tool                                        | Use for                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| `todowrite`                                 | Track FSx features per sprint in order                                 |
| `bash`                                      | pnpm/turbo/docker/playwright commands; never for reading/writing files |
| `read` / `glob` / `grep` / `edit` / `write` | Docs-first; edit existing code, no drive-by rewrites                   |
| `question`                                  | `[owner decision]` blockers                                            |
| `websearch` / `webfetch`                    | Vendor/pricing/latency research, error lookup                          |
| `skill`                                     | Invoke any listed skill below                                          |

### Skills map (which to use when)

| Skill                                                 | Applies in                                                                                                     |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `gstack`                                              | Load at session start; machine checks; parent of gstack workflows                                              |
| `verify`                                              | Every sprint: build/test loop until green                                                                      |
| `qa` / `qa-only`                                      | After each feature: hunt and fix/report bugs                                                                   |
| `review` / `code-review`                              | Per PR: review the diff before merge                                                                           |
| `differential-review`                                 | Security-focused review of diffs (auth, ledger, money-adjacent, admin sprints)                                 |
| `cso` / `best-practices`                              | Security audits (Sprints 3, 12, 13, 15 mandatory)                                                              |
| `test-audit`                                          | Before closing a sprint: kill low-value tests                                                                  |
| `health`                                              | Sprint closure: code-quality dashboard                                                                         |
| `ship`                                                | Sprint end: VERSION bump, CHANGELOG, PR ritual                                                                 |
| `investigate` / `gstack-openclaw-investigate`         | Debugging failures, root cause analysis                                                                        |
| `supabase-postgres-best-practices`                    | Load BEFORE any schema/migration work (Sprints 0, 4, 6, 8, 12, 13)                                             |
| `frontend-design` / `design-taste-frontend`           | All real UI (Sprints 1, 2, 5, 7, 8, 9, 11, 12) — must not make it look templated; design doc wins on conflicts |
| `emil-design-eng` / `review-animations`               | Motion decisions + animation review (Sprint 1 signature moment, count-up)                                      |
| `find-animation-opportunities` / `improve-animations` | Sprint 15 polish pass                                                                                          |
| `accessibility`                                       | Sprint 1 + UI sprints: WCAG 2.2 audit, keyboard, contrast, aria-live                                           |
| `webapp-testing`                                      | Playwright-driven UI verification, screenshots, console logs — every UI sprint                                 |
| `vercel-react-best-practices`                         | All React/Next code (perf patterns: bundle size, rerenders)                                                    |
| `jest-skill`                                          | Test authoring patterns (adapt to Vitest) in API-heavy sprints                                                 |
| `spec`                                                | Any vague feature: distill into executable spec first                                                          |
| `pick-ui-library`                                     | Only if invoked explicitly; use when choosing a 3rd-party UI lib (toasts, OTP inputs, virtualization)          |
| `prototype`                                           | Only when invoked explicitly; Sprint 2 alternates                                                              |
| `senior-architect`                                    | ADRs for architecture decisions (Sprint 0, 13)                                                                 |
| `document-generate`                                   | Missing docs for shipped features                                                                              |
| `document-release` / `make-pdf`                       | Sprint 17 launch docs                                                                                          |
| `retro` / `gstack-openclaw-retro`                     | Weekly/after-closed-beta retrospective                                                                         |
| `learn`                                               | Capture project learnings per sprint                                                                           |

### Sprint hygiene rules (apply everywhere)

1. **Docs first**: read cited doc sections before coding; do not redesign what the docs already answer.
2. **Modules stay modular**: no cross-module table access; interfaces + outbox events only (TA §Architecture style).
3. **Money is never float**: minor units + currency; `timestamptz` everywhere; UUIDv7 ids (app-generated).
4. **Zod at the edge** for every request; idempotency keys on mutating endpoints (TA).
5. **Expand-contract migrations only**; no destructive SQL in a deploy path.
6. **PRs**: one per feature batch; branch `sprint-{n}/{feature}`; PR template must list the sprint feature IDs it closes; GitHub MCP creates the PR; `review`/`code-review` skills review it; a merged PR is the only accepted proof for its checklist items.
7. **Checklist honesty**: a tick means a test, command, or PR proves it. Anything `[owner decision]` unresolved is an open GitHub issue linked from the sprint file before it is "done".
8. Commit checklist ticks with the implementing PR; not as a separate chore commit unless trivial.
9. Run `verify` (gstack) at the end of every work block; run `qa` before claiming a sprint done.
10. Update `docs/` (PRD/UX/Design) only when docs are actually wrong — amendments are separate PRs with `document-generate` for anything missing.

## Definition of done (per sprint)

- All checklist items ticked or explicitly deferred with a linked GitHub issue
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` green in CI
- Unit + integration tests for every feature in the sprint that touches logic; e2e for each user-facing flow
- PR reviewed (code-review skill + Copilot review + human), checklist items traceable to PRs
- Storybook entries for new/changed components (UI sprints)
- `docs/` open decisions surfaced (not silently avoided)
- PostHog events for any new player-visible action (metric capture, see PRD success metrics)
- Sprint file anchored: "Delivered in PR #xxxx" lines beside the checkboxes they prove

## Standing audit policy

Per sprint, in order:

1. Implement → `qa` sweep → checklist self-audit
2. PR diff review via `review`/`code-review` skill; security-relevant diffs additionally via `differential-review`
3. Sprint-level audit with `cso` (security), `test-audit` (test quality), `accessibility` (UI sprints), `design-review` (UI sprints)
4. `ship` ritual: version bump, CHANGELOG, push, PR merge with green checks
5. `retro` noting what to change in the process; `learn` to persist
