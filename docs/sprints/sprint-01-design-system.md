# Sprint 1 — Design System Implementation

- Milestone: **M1** (Delivery Plan weeks 1–4; runs parallel with Sprint 0)
- Stage: 1
- Depends on: Sprint 0 (web scaffold, tokens package shell)
- Testing/board target: components are the building blocks the Sprint 2 prototype assembles

## Goal

Turn `docs/Design System RAISE (Stage 1).md` into code: the tokens package as the single source of truth, the theme layer (Tailwind + shadcn), and the core component library with every state, dark and light. Nothing here is speculative — every component listed exists in the doc.

## Features

### F1.1 Tokens package complete

- `packages/tokens/tokens.json` carries, verbatim from the doc: §2 dark/light color tables + status colors (win/loss/dispute) + scrim values; §3 type scale table (display…stat-lg) incl. label style (uppercase, 0.06em tracking); §4 spacing scale (4→64), page margins, breakpoints, radius scale (0/2/4/6), border widths, elevation shadows, glow; §5 motion durations (100/160/240ms) + easing `cubic-bezier(0.2,0,0,1)`
- Build step emits: CSS variables for web (the doc §12 CSS block shape) and typed TS constants (for future React Native)
- Unit test: dark/light tables in `tokens.json` equal the doc's tables (drift guard)

### F1.2 Fonts

- Self-host Chakra Petch weights 500/600/700 as woff2, `font-display: swap` (Design §3)
- Latin + **Latin Extended** subsets (Yoruba ẹ/ọ/ṣ must render — checklist test)
- Preload only the above-the-fold display file; system UI stack for body (download = body face only)
- Decide tabular-numeral question after the doc's device test: if Chakra Petch tabular figures at 12–14px are unusable, digits fall back to a mono face (e.g. Share Tech Mono) — record the device-test outcome `[owner decision]` if it diverges

### F1.3 Theme wiring

- Tailwind extended with tokens (colors, radii 2/4/6, font families)
- shadcn variable mapping per doc §12 table (`--background`=bg-0 … `--destructive`=loss)
- `data-theme` attribute switching: dark default, light optional, system-follow option persisted to profile + localStorage
- No pill shapes, no round avatars anywhere in the theme defaults; status dots are the only circles

### F1.4 Core components (doc §8 — implement every variant/state listed)

Build as shadcn-based components themed by tokens, in a `packages/ui`-style export from web (or `packages/ui` package if cleaner):

- **Button**: primary/secondary/ghost/danger; sm 32 / md 44 / lg 48; default, pressed, focus ring, disabled (40% + helper text), loading (fixed-width spinner, aria-busy); verb-first sentence-case labels (doc)
- **Input**: height 44, radius 4, bg-2, label above (body-sm), helper/error below (caption + icon, never color alone); numeric `inputmode`; native selects on mobile
- **OTP input**: six 44×52 cells, `autocomplete="one-time-code"`, paste-fills-all, auto-advance, resend countdown 30s, plain-text error
- **Status chip**: height 24, radius 2, 14px icon + label; variants neutral/accent/dispute/win/loss/muted; never interactive
- **Banners**: needs-action (accent) / offline / system; persist until resolved
- **Toasts**: 4s, above bottom nav, `role=status`; errors persist until dismissed; no critical info via toast
- **Sheets & modals**: mobile bottom sheet (radius 4 top corners, ≤90% height, scrim, focus trap, Escape/back dismissal); desktop modal 480/640; destructive confirmations use an explicit verb button (doc: "Cancel challenge", never OK)
- **Empty states**: 32px icon, h3 title, one body-sm line, one primary action
- **Avatars**: square, 2px radius, initials fallback + generated pattern from username (no photo upload assumed)
- **Rating badge, rank tier badge, reputation badge**: per doc §8 incl. chamfer + glow rules (tier 5 only), provisional hollow marker
- **Tables (admin)**: row 40, sticky header, tabular right-aligned numerics, hover bg-3, selected 2px accent left border, pagination/keyboard nav (consumed in Sprint 12)

### F1.5 Iconography and imagery rules (doc §6)

- Lucide via shadcn, inline tree-shaken, sizes 16/20/24, the doc's status icon mapping
- Game identity = text labels + neutral monograms (no publisher logos)
- No imagery of cash, money rain, casino motifs — add a lint-relevant review note; screenshots treated as untrusted content (EXIF strip + signed URLs — enforced in Sprint 8, documented here)

### F1.6 Motion foundations (doc §5)

- Durations + easing tokens apply to all transitions; transform/opacity only
- Signature moment reserved: rating count-up on result-confirmed (240–400ms) — component stub with reduced-motion off-switch (wired to data in Sprint 10)
- Skeletons for lists/cards; spinners only inside buttons; full `prefers-reduced-motion` story per component

### F1.7 Storybook + governance

- Storybook per component with the a11y addon (doc §13)
- Story coverage = component definition of done: all states, dark+light, 360 and 1024 widths, keyboard, reduced motion, i18n text growth (+30% headroom strings)
- Playwright visual regression configured on key components
- Token change process: PR + changelog entry (doc §13)

## Design compliance

This entire sprint IS the design doc. Fidelity requirement: a reviewer comparing Storybook stories to the doc tables must find zero drift. Use `accessibility` (WCAG AA contrast on every pairing, focus never removed) and `design-review` before closing.

## Files and references

| Ref                                                          | What                                                                                                                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/Design System RAISE (Stage 1).md` §§1–14               | Authoritative source: colors, type, spacing/shape, motion, icons, component specs, content, a11y, perf budget, implementation, governance, open decisions |
| `docs/UX Flow Spec RAISE (Stage 1).md` §Shell and principles | Context for how components compose (bottom nav, banner, switcher — built in Sprint 2)                                                                     |
| `sprints/sprint-00-setup-foundations.md` F0.6                | Tokens package shell this sprint completes                                                                                                                |
| `sprints/README.md`                                          | Legend + hygiene                                                                                                                                          |

## Skills, agents, MCP and tools

| Kind  | Resource                                     | Use for                                                                                    |
| ----- | -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Skill | `frontend-design` / `design-taste-frontend`  | Ensure implementation reads designed, not templated — doc wins on conflict                 |
| Skill | `emil-design-eng`                            | Button/toast/sheet interaction detail + motion taste                                       |
| Skill | `review-animations`                          | Review the motion layer + count-up stub against craft bar                                  |
| Skill | `accessibility`                              | WCAG 2.2 pass per component; contrast checker over all pairings                            |
| Skill | `design-review`                              | Designer's-eye QA sweep after components land                                              |
| Skill | `verify`                                     | Per work block                                                                             |
| Skill | `qa`                                         | Bug sweep on component demos                                                               |
| Skill | `code-review` / `review` + `design-review`   | PR review ritual for the components PR                                                     |
| Skill | `test-audit`                                 | On story/test sprawl before close                                                          |
| Agent | `explore`                                    | Find all existing styled components/tailwind config to avoid duplication before adding any |
| MCP   | `context7`                                   | Tailwind v4 + shadcn current docs; Storybook a11y addon docs; woff2/subsetting tooling     |
| MCP   | `github`                                     | Component PRs, issue for `F1.2` font decision                                              |
| Tools | `todowrite` F1.1–F1.7                        | Tracking                                                                                   |
| Tools | `read`/`write`/`edit`, `bash`, `glob`/`grep` | Implementation; never pnpm-style file writes via shell                                     |

## Testing

- Unit: token emission snapshot matches doc tables (colors/spacing/type); test that every component file exposes documented variants
- Visual: Playwright screenshot diffs dark+light for every Storybook story on 360/1024
- A11y (`accessibility` skill + axe in Playwright): zero critical violations per story; keyboard walkthrough on sheet/modal trap and OTP cells
- Font proof: fixture page renders ẹ, ọ, ṣ in display face; tabular figure check at 12/14px; preloaded font byte check (doc target ≤ ~40 KB total)
- Reduced-motion: verify count-up stub renders instant/complete under emulation
- i18n growth: run placeholder strings 30% longer and confirm no clipped chips/buttons

## Audit

- `design-review` + `accessibility` full passes (UI sprint — mandatory)
- `emil-design-eng` / `review-animations` on motion implementation
- Doc-fidelity diff checklist: walk §2–§8 tables against Storybook — log any deviation in an issue (zero drift expected)
- Dependency audit: confirm no icon fonts, no Orbitron, no backdrop-filter/large-blur packages snuck in (doc §6/§11 bans)

## Checklist

- [x] F1.1 tokens.json complete per doc §2–§5; CSS + TS emit working; drift test green
- [x] F1.2 Fonts self-hosted (Latin + Latin-Ext); Yoruba glyphs render; preload budget ≤ ~40 KB; tabular decision recorded
- [x] F1.3 Theme wired dark default + light + system; radius scale 2/4/6; no pills/round avatars; theme choice persists
- [x] F1.4 Button/Input/OTP/Chip/Banner/Toast/Sheet+Modal/Empty/Avatar/Badges/Table all built with doc variants+states
- [x] F1.5 Icons: Lucide 16/20/24 square caps; status icon mapping implemented; publisher-logo + casino-imagery bans enforced
- [x] F1.6 Motion tokens enforced; transform/opacity only; count-up stub with reduced-motion switch exists
- [x] F1.7 Storybook + a11y addon up; every component's stories cover states×themes×widths; visual regression in CI; token changelog process documented
- [x] Testing block all green; screenshots archived
- [x] Audit block done: accessibility, design-review, animation reviews passed or findings filed and fixed
- [x] `[owner decision]` items surfaced: tabular numerals outcome, chamfer treatment after first on-screen review (doc §14), violet-fallback confirm
- [ ] Sprint closed via `ship`: PR merged, CHANGELOG entry, checklist ticks committed
