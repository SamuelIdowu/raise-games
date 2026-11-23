# RAISE web — Blocks.fun frontend overhaul

**Branch:** `feat/frontend-overhaul`
**Status:** Phase 2 — plan rewritten against the Blocks.fun system. **Awaiting owner approval before any application code changes.**
**Baseline commit:** `7ab6217` — `docs(design): add Blocks.fun design system reference` (the reference file was committed; Prettier normalised its markdown formatting only).

---

## 1. Locked owner decisions

These are settled. The plan below implements them; it does not reopen them.

| #   | Decision                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Blocks.fun is the visual authority.** The existing cyan/Chakra Petch design system is not implemented in the frontend. `docs/Design System RAISE (Stage 1).md` stays in the repo as historical context only. |
| 2   | **`docs/ref_img/ref_3_main.webp` is the reference for every screen.** `ref_1.webp` and `ref_2.webp` are ignored.                                                                                               |
| 3   | **Routes:** `/` is the public landing page; `/home` is the signed-in dashboard; `/status` is the existing health page. Nav “Home” points to `/home`.                                                           |
| 4   | **Dark is the default theme; light is introduced** as a fully supported Blocks-compatible theme. Keep the dark/light/system toggle.                                                                            |
| 5   | **Use product semantics from the docs.** No crypto, wallet, betting, “mine”, or `$`-coin language or imagery. Stage 1 is free 1v1 duels.                                                                       |
| 6   | **Typography uses the best scale for each context:** literal Blocks display sizes for marketing; a readable app scale (body 14px, caption 12px, label 11px, display 40/32px) for authenticated screens.        |
| 7   | **Functional fixes are in scope:** `/profile` uses real profile/match data; `GameSwitcher` uses the three configured games and actually opens its sheet; selection is shared/persisted.                        |
| 8   | **i18n is skipped.** No `next-intl`, no locale routes. Copy is centralised in typed constants so it can be localised later.                                                                                    |
| 9   | **Admin restyle is confirmed at the lighter depth:** tokens, shell, tables, forms, density. No decorative cubes, coins, or giant display type.                                                                 |
| 10  | **Verification is completed**, including starting the Docker stack for API/DB-backed E2E.                                                                                                                      |
| 11  | **Frontend only.** Do not change backend logic, API contracts, or data models. Preserve all existing routes and SEO metadata.                                                                                  |

---

## 2. Sources and conflict rules

**Priority when sources disagree**

1. `docs/Blocks.fun Design System.md` — visual language, tokens, components, motion.
2. `docs/UX Flow Spec RAISE (Stage 1).md` — screens, shell, states, behaviour.
3. `docs/RAISE PRD v2 Staged Rollout.md`, `docs/Product Brief RAISE.md`, `docs/decisions/0002-launch-formats.md`, `docs/decisions/0003-ux-open-decisions.md` — semantics, scope, copy.
4. `docs/ref_img/ref_3_main.webp` — composition and section anatomy.
5. Installed skills — critique, accessibility, performance, testing.

**Rules**

- Product semantics always beat Blocks’ crypto/marketplace copy. If Blocks says “Connect Wallet”, RAISE says “Sign in”.
- Accessibility beats visual fidelity. Any deliberate deviation from the Blocks doc is recorded in `DESIGN.md` with the measured contrast and the reason.
- The UX spec beats `ref_3` for app navigation and screen structure. `ref_3` is the visual vocabulary, not the IA.
- Existing routes, API calls, and metadata are preserved unless this plan explicitly improves them.

**Reference mapping (what we take from `ref_3`)**

| Reference pattern                  | RAISE use                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| 72px header, cream CTA, purple CTA | Public site header and landing hero.                                                 |
| Heavy uppercase hero, 2 lines      | Landing hero. App pages use smaller display sizes.                                   |
| Orange chamfered stat cards        | Rule cards on landing; rank/record stat cards in the app.                            |
| 4-step “how it works”              | Challenge → accept → play → confirm flow.                                            |
| Purple full-bleed promo banner     | “Ready to settle it?” banner and create-challenge CTA.                               |
| Cream cards, outline CTAs          | Game/format cards, rules cards, empty states.                                        |
| FAQ accordion                      | Landing FAQ and settings disclosure rows.                                            |
| Footer wordmark, link columns      | Public footer.                                                                       |
| Cubes, pixel icons, checker bands  | Original RAISE assets only. No copied Blocks assets, no `$` coins, no partner logos. |

---

## 3. Design direction

**One-line direction:** an arcade scoreboard for competitive gaming — loud, hard-edged, and legible — not a casino and not a crypto marketplace.

- **Subject:** a free 1v1 challenge platform for eFootball, Call of Duty: Mobile, and PUBG Mobile players in Nigeria who want structured, provable competition.
- **Audience:** mobile-first competitive players, 16–30; they know the games, not the product. The page must explain the loop in one scroll.
- **The one bold thing:** the **settled result** moment — a chamfered card with a giant rating count-up and a hard orange result band. Everything else supports it.
- **Second signature:** the original isometric **RAISE cube cluster** in the hero and promo banner. Built from orange, cream, and purple block faces; “R” pixel on the top face. No currency symbols.
- **Restraint:** one saturated colour per block; at most three ambient elements (floaters, checker band, glow); no soft shadows; no gradient blobs; no glassmorphism.
- **Voice:** imperative, short, confident. “Create the challenge.” “Accept and play.” “Both players confirm.” No “bet”, “wager”, “cash out”, “win big”, “liquidity”, “APR”, “wallet”.

**Anti-generic checklist**

- No default Next.js SVGs or favicon.
- No stock photography; no publisher logos; no game key art.
- No lorem ipsum, fake testimonials, or invented user counts.
- No generic SaaS dashboard cards with rounded-2xl + soft shadow.
- No purple-to-pink gradient buttons; purple is a flat brand fill with a hard edge.
- No icons from three different families. Lucide is used only for universal UI actions; everything brand-specific is an original pixel icon.
- No more than one full-bleed colour banner per viewport.
- Every page has a real empty state and a real error state.

---

## 4. Foundations

### 4.1 Token pipeline (single source of truth)

- `packages/tokens/tokens.json` remains the only source. Extend it beyond colour/radius/motion to include:
  - colour (semantic + brand scales, dark and light)
  - type sizes/line-heights/tracking/weights (marketing + app)
  - spacing, layout widths, header/sidebar/nav heights, gutters
  - radii, chamfer sizes, border widths
  - motion durations/easings, ambient loop durations
  - z-index
- `packages/tokens/scripts/emit-css.mjs` emits:
  - `packages/tokens/dist/tokens.css`
  - `apps/web/src/app/tokens.css`
  - **new** `apps/web/src/lib/tokens.generated.ts` (typed colour + layout constants for `viewport.themeColor`, manifest generation, and tests)
- `apps/web/src/app/globals.css` maps tokens into Tailwind v4 `@theme inline` under the existing semantic names, so existing components restyle without a class-name rewrite.
- `packages/tokens/src/tokens.test.ts` is rewritten to assert the Blocks values, both themes, and the new scales. It currently hardcodes the old cyan values and must change.
- Add `apps/web/scripts/check-tokens.mjs` and a `check:tokens` script: fail if `apps/web/src` contains a raw `#RRGGBB`/`rgb()`/`hsl()` outside `tokens.css`, `tokens.generated.ts`, and the theme bootstrap script. Wire it into the verification checklist.
- Add ESLint `no-restricted-syntax` for hex literals in TSX as a second guard.

### 4.2 Semantic colour tokens

Existing utilities (`bg-bg`, `bg-surface`, `bg-raised`, `bg-overlay`, `border-line`, `text-fg`, `text-fg-muted`, `text-fg-subtle`, `bg-accent`, `text-accent`, `win/loss/dispute`) keep their names. Values change.

| Semantic token   | Dark                                      | Light                  | Usage                                                         |
| ---------------- | ----------------------------------------- | ---------------------- | ------------------------------------------------------------- |
| `bg-0`           | `#0A0C0D`                                 | `#F5F1E8`              | Page background                                               |
| `bg-1`           | `#111314`                                 | `#EDE8DD`              | Alternating section / deep panel                              |
| `surface-1`      | `#17191A`                                 | `#FFFFFF`              | Cards, sheets, inputs                                         |
| `surface-2`      | `#202223`                                 | `#F8F5EF`              | Raised cards, table header, hover base                        |
| `overlay`        | `#26292B`                                 | `#E7E1D5`              | Hover, pressed, inset panels                                  |
| `border`         | `#232628`                                 | `#D6CFC2`              | Decorative card/section borders                               |
| `border-strong`  | `#34383B`                                 | `#B4AB9B`              | Strong dividers                                               |
| `control-border` | `#5E6469`                                 | `#8F8575`              | Inputs/controls; meets 3:1 non-text contrast (a11y extension) |
| `fg`             | `#FFFFFF`                                 | `#0A0C0D`              | Primary text                                                  |
| `fg-muted`       | `#B8BCC0`                                 | `#3A3F43`              | Secondary text                                                |
| `fg-subtle`      | `#7C8186`                                 | `#62686D`              | Captions, metadata (≥11px)                                    |
| `fg-disabled`    | `#4F5459`                                 | `#8E9499`              | Disabled labels and decorative-only text                      |
| `accent`         | `#FF4F00`                                 | `#A83300`              | Primary interactive fill/text (orange)                        |
| `accent-hover`   | `#FF7433`                                 | `#8F2A00`              | Hover                                                         |
| `accent-press`   | `#E04400`                                 | `#752200`              | Pressed                                                       |
| `accent-subtle`  | `rgba(255,79,0,.12)`                      | `rgba(168,51,0,.10)`   | Selected rows, soft callouts                                  |
| `on-accent`      | `#0A0C0D`                                 | `#FFFFFF`              | Text/icon on `accent`                                         |
| `brand`          | `#8A2BFF`                                 | `#7016E0`              | Brand moments, promo banner, secondary CTA                    |
| `brand-hover`    | `#A25CFF`                                 | `#5C10BC`              | Hover                                                         |
| `brand-press`    | `#7016E0`                                 | `#480B96`              | Pressed                                                       |
| `brand-subtle`   | `rgba(138,43,255,.16)`                    | `rgba(112,22,224,.10)` | Brand tint                                                    |
| `on-brand`       | `#FFFFFF`                                 | `#FFFFFF`              | Text/icon on `brand`                                          |
| `orange-300…700` | `#FF9A66 #FF7433 #FF4F00 #E04400 #A83300` | same                   | Brand scale; decorative fills use orange-500 with `on-orange` |
| `purple-300…600` | `#C08BFF #A25CFF #8A2BFF #7016E0`         | same                   | Brand scale                                                   |
| `cream`          | `#F1EEE8`                                 | `#F1EEE8`              | Cream cards/buttons on dark; paper accent on light            |
| `on-cream`       | `#0A0C0D`                                 | `#0A0C0D`              | Text on cream                                                 |
| `on-orange`      | `#0A0C0D`                                 | `#0A0C0D`              | Text on orange-500 decorative fills                           |
| `success`        | `#A3E635`                                 | `#4D7C0F`              | Wins, positive outcomes                                       |
| `warning`        | `#FFC93C`                                 | `#92400E`              | Disputes, attention                                           |
| `danger`         | `#FF3B3B`                                 | `#B91C1C`              | Losses, destructive actions                                   |
| `info`           | `#8A2BFF`                                 | `#7016E0`              | Informational                                                 |
| `scrim`          | `rgba(0,0,0,.64)`                         | `rgba(10,12,13,.48)`   | Modal/sheet backdrop                                          |

**Status aliases:** `win → success`, `loss → danger`, `dispute → warning`. Status is never communicated by colour alone; every badge has a label and icon.

**Contrast rules**

- Body text ≥ 4.5:1; large display ≥ 3:1.
- White on orange-500 is ~3.3:1, so orange-500 is never a small-text background. Small text on an orange fill uses `on-orange` (`#0A0C0D`), which is ~6:1.
- Light theme links/buttons use orange-700 (`#A83300`, ~5.9:1 on paper); orange-500 is reserved for large numerals, decorative fills, and focus accents.
- `fg-disabled`/`text-4` is decorative or disabled only, never body copy.
- Inputs and controls use `control-border` (≥3:1) plus a 2px `accent` focus ring with 2px offset.

### 4.3 Typography

Fonts, loaded with `next/font/google`:

- **Display:** `Unbounded`, variable, weights 800/900, `latin` + `latin-ext`, `display: swap`, preloaded.
- **Body:** `Space_Grotesk`, variable, weights 400–700, `latin` + `latin-ext`, `display: swap`, not preloaded.
- **Mono:** system `ui-monospace` for game IDs, room codes, and match IDs. Do not add a third webfont.
- Remove `Chakra_Petch`. Keep the `font-display` utility name pointing at Unbounded; `font-sans`/`font-body` point at Space Grotesk.
- If the build environment cannot fetch Google Fonts, vendor the two variable `.woff2` files into `apps/web/src/fonts` and switch to `next/font/local`. This is a build-time contingency, not a design change.

**Marketing scale** (literal Blocks scale, with the 10.5px caption raised to 11px)

| Token        | Size / line-height                  | Weight | Case / tracking    |
| ------------ | ----------------------------------- | ------ | ------------------ |
| `display-xl` | `clamp(2.75rem, 6vw, 5rem)` / 0.9   | 900    | Uppercase, -0.02em |
| `display-lg` | `clamp(2.5rem, 4.5vw, 3.5rem)` / 1  | 900    | Uppercase, -0.02em |
| `h2`         | `clamp(1.75rem, 3.5vw, 2.5rem)` / 1 | 900    | Uppercase          |
| `h2-mixed`   | same as `h2`                        | 900    | Sentence case      |
| `h3`         | `1rem` / 1.2                        | 700    | Uppercase, 0.02em  |
| `metric`     | `1.375rem` / 1                      | 800    | Tabular numerals   |
| `body-lg`    | `0.875rem` / 1.5                    | 500    | Sentence case      |
| `body`       | `0.8125rem` / 1.6                   | 500    | Sentence case      |
| `caption`    | `0.6875rem` / 1.5                   | 500    | Uppercase, 0.04em  |
| `label`      | `0.6875rem` / 1                     | 600    | Uppercase, 0.12em  |
| `button`     | `0.75rem` / 1                       | 700    | Uppercase, 0.06em  |
| `legal`      | `0.625rem` / 1.4                    | 500    | Sentence case      |

**App scale** (readable; never below 11px for real text)

| Token     | Size / line-height               | Weight | Notes                |
| --------- | -------------------------------- | ------ | -------------------- |
| `display` | `2.5rem` / 1 (2rem mobile)       | 900    | Page-level hero only |
| `h1`      | `2rem` / 1.1 (1.75rem mobile)    | 800    | Page title           |
| `h2`      | `1.5rem` / 1.2 (1.375rem mobile) | 800    | Section              |
| `h3`      | `1.125rem` / 1.3                 | 700    | Card title           |
| `body`    | `0.875rem` / 1.5                 | 500    | Default              |
| `body-sm` | `0.8125rem` / 1.45               | 500    | Dense rows           |
| `caption` | `0.75rem` / 1.4                  | 500    | Metadata             |
| `label`   | `0.6875rem` / 1                  | 600    | Uppercase, 0.1em     |
| `stat-lg` | `2.5rem` / 1 (2rem mobile)       | 900    | Tabular              |
| `stat-md` | `1.5rem` / 1.1                   | 800    | Tabular              |
| `legal`   | `0.625rem` / 1.4                 | 500    | Legal only           |

- Headings are uppercase only on marketing pages and labels. App page titles use sentence case with the same weight, because uppercase hurts scanability at 14px.
- Long usernames, emails, and game IDs must wrap/truncate without breaking layout (`overflow-wrap:anywhere`, `min-w-0`).

### 4.4 Shape, borders, spacing, layout

- **Radii:** `xs 4px`, `sm 6px`, `md 12px`, `lg 16px`, `pill 999px`. Existing `rounded-card` → 12px; `rounded-control` → 6px; `rounded-modal` → 16px; Tailwind `rounded-lg` maps to 16px, `rounded-md` to 6px, `rounded-sm` to 4px.
- **Chamfer utilities:** `.chamfer-tr` (16px), `.chamfer-tr-sm` (10px), `.chamfer-both` (16px/28px), `.pixel-bite` (one 8px stepped corner). Implemented with CSS custom properties + `clip-path: polygon(...)`. Add inner padding so focus rings are not clipped; tested in both themes.
- **Borders:** 1px `border`; 1px `border-strong` for emphasis; no soft shadows. Dark cards get `inset 0 1px 0 rgba(255,255,255,.04)`. Light featured cards may use a 4px hard offset `box-shadow: 4px 4px 0 rgba(10,12,13,.08)`; ordinary cards do not.
- **Checker band:** `.checker-band` using a repeating-conic-gradient in `orange-500`/`cream` or `orange-500`/`bg-0`; used once per page maximum.
- **Spacing:** 4px base. Section spacing 64/96/128; card padding 16/20/24; control gap 8/12; mobile gutter 16, tablet 24, desktop 48.
- **Layout:** marketing container 880px; app container 1200px; reading column 640px. Desktop site header 72px; app header 72px (desktop) / 56px (mobile); sidebar 240px (collapsed 72px); bottom nav 56px + `env(safe-area-inset-bottom)`.
- **Z-index:** base 0, sticky 30, header/nav 40, sheet 50, toast 60.

### 4.5 Motion

- Durations: fast 120ms, base 200ms, slow 400ms, ambient 6000–8000ms.
- Easings: `cubic-bezier(0.22, 1, 0.36, 1)` for entrances; `ease-out` for exits.
- Budget: at most 3 moving elements per viewport; no animation of layout properties; use `transform`/`opacity` only.
- Patterns: hero entrance (fade + 12px rise, staggered 60ms), scroll reveal for sections, stat count-up on first view, cube float (6–8s), marquee (pause on hover/focus), button press (scale .98), sheet slide, toast slide.
- `prefers-reduced-motion: reduce`: remove transforms, marquees, floaters, and count-up; show final values immediately. This is a hard requirement.

### 4.6 Themes

- Dark is default. Light is a first-class theme; system preference is supported.
- Keep the existing pre-hydration theme bootstrap and the Settings control; rename values to `raise-theme` (`dark`/`light`/`system`).
- `viewport.themeColor` uses media queries: dark `#0A0C0D`, light `#F5F1E8`. Values come from `tokens.generated.ts`, not literals.
- Light-specific composition rules:
  - Warm paper background, white cards, near-black text, hard 1px borders.
  - Interactive accent is orange-700; orange-500 is a decorative fill with dark text.
  - Purple brand moments use purple-600 with white text.
  - Chamfers, pixel icons, checker bands, and hard edges remain. No switch to soft “SaaS light”.
- Theme QA on every page: text contrast, borders, focus rings, charts/badges, images/assets, disabled states, skeletons, scrims.

---

## 5. Components

### 5.1 Keep and restyle (semantic names stay)

`Button`, `Input`, `Textarea`, `Select`, `Checkbox`, `Radio`, `Switch`, `Badge`, `Chip`, `Avatar`, `Card`, `Dialog`, `Sheet`, `Dropdown`, `Tabs`, `Tooltip`, `Toast`, `Skeleton`, `Spinner`, `Progress`, `EmptyState`, `ErrorState`, `Pagination`, `Table`, `ChallengeCard`, `MatchRow`, `StatCard`, `PageHeader`, `SectionHeader`.

### 5.2 New primitives

| Component                   | Purpose                                      | Notes                                                                                             |
| --------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `Eyebrow`                   | Orange 6×6 square + uppercase label          | Used on every marketing section                                                                   |
| `Container`                 | Marketing/app/reading widths                 | Replaces ad-hoc `max-w-*` wrappers                                                                |
| `Section`                   | Vertical rhythm + optional divider/checker   | One API for marketing/auth/app                                                                    |
| `ChamferBox`                | Chamfered surface with border                | `size="sm                                                                                         | md  | lg"`, `tone="surface | orange | purple | cream"` |
| `StatCard`                  | Big numeral + tiny caps + pixel icon         | Orange chamfer variant for landing rules                                                          |
| `PixelIcon`                 | Original 16/24px pixel icon set              | Trophy, swords, controller, clock, shield, flame, crown, gem, handshake, check, flag, chat, arrow |
| `CubeCluster`               | Original isometric RAISE cubes               | Hero, promo banner, empty states; CSS/SVG only                                                    |
| `RankToken`                 | Non-currency rank disc with chevrons/numeral | Replaces Blocks’ coins; never a `$`                                                               |
| `Marquee`                   | Supported-game / rule ticker                 | Accessible: pauses on hover/focus, disabled with reduced motion                                   |
| `Accordion`                 | FAQ + disclosure rows                        | Custom, keyboard-complete, no new dependency                                                      |
| `Stepper`                   | Onboarding progress + numbered steps         | Current/completed/upcoming states                                                                 |
| `CountUp`                   | Rating/metric animation                      | Respects reduced motion; final value in DOM                                                       |
| `SiteHeader` / `SiteFooter` | Public shell                                 | Distinct from app shell                                                                           |
| `UserCard`                  | Sidebar user block                           | Avatar, username, rating, settings link                                                           |
| `GameProvider` / `useGame`  | Shared game selection                        | Config-driven, persisted, URL-synced                                                              |
| `NavConfig`                 | Single nav source                            | Sidebar/bottom nav/top bar all read it                                                            |
| `PageState`                 | Loading/empty/error composition              | Standardises copy and actions                                                                     |
| `TopBar`                    | App header                                   | Title, game switcher, notifications, avatar                                                       |

### 5.3 Component rules

- **Button:** variants `primary` (orange), `brand` (purple), `secondary` (cream/white), `ghost`, `danger`; sizes `sm 32`, `md 36`, `lg 44`, `xl 48`; uppercase label; optional trailing pixel arrow; loading spinner; disabled state. Visual height may be 36px, but the hit target is always ≥44px on touch (`::before` expansion or padding).
- **ChallengeCard:** the Blocks “mine card” anatomy, repurposed:
  - header: game name + format pill
  - body: poster avatar, username, rating/record/reputation
  - meta: time window, proof required, status
  - footer: primary action (`Accept challenge`), secondary (`View`)
  - featured variant: 16px chamfer, thin orange top rule
  - states: default, mine, for-me, pending, live, expired, disputed
  - never shows a currency amount; “Free” is a text chip.
- **StatCard:** orange chamfer, pixel icon in a circle, `stat-lg` numeral, `label` caption. On light, orange fill + `on-orange` text. No invented data.
- **Table:** header `surface-2`, 1px rules, 56px rows (40px admin), zebra optional, numeric columns tabular, selected row `accent-subtle`. Mobile tables become stacked cards; no horizontal scroll for primary data.
- **Sheet/Dialog:** `surface-1`, 1px border, 16px chamfer on desktop, full-width bottom sheet on mobile, 44px close target, focus trap, `Esc`, scrim.
- **Inputs:** 6px radius, `control-border`, 44px min height, label above, error text + icon (not colour-only), mono for game IDs/scores.
- **Accordion:** `<button aria-expanded>` + region; arrow rotates; no layout jump; reduced motion respected.
- **Skeletons:** block shapes that match the final layout; static (no shimmer) under reduced motion.
- **EmptyState:** original pixel/cube illustration + one sentence + one action. No sad-face emoji.
- **ErrorState:** plain explanation + retry + support link; no raw stack traces.
- **Toasts:** `surface-2`, 4px left accent bar, 44px close, auto-dismiss 5s, pause on hover.

### 5.4 Do not add

- No Radix, Headless UI, Framer Motion, GSAP, or a second icon library.
- No new state manager; React context + existing API client is enough.
- No component library rewrite; restyle in place.

---

## 6. Architecture

### 6.1 Route groups and layouts

Paths do not change. Layout ownership becomes explicit:

```
src/app/
  layout.tsx                 # fonts, metadata, theme bootstrap, ToastProvider (no app shell)
  (site)/
    layout.tsx               # SiteHeader + SiteFooter
    page.tsx                 # / landing
    terms/page.tsx
    privacy/page.tsx
    community-rules/page.tsx
    status/page.tsx          # moved health page
  (onboarding)/
    layout.tsx               # bare, centered, no nav
    onboarding/phone|otp|username|games|game-ids|consent/page.tsx
  (app)/
    layout.tsx               # RequireAuth + AppShell
    home/page.tsx            # NEW dashboard
    play/page.tsx
    matches/page.tsx
    matches/[id]/page.tsx
    leaderboard/page.tsx
    inbox/page.tsx
    messages/[id]/page.tsx
    messages/blocked/page.tsx
    profile/page.tsx
    profile/[userId]/page.tsx
    settings/page.tsx
    feedback/page.tsx
  admin/                     # existing layout, restyled only
  verify-email/page.tsx
  design/page.tsx            # living token/component showcase
  font-proof/page.tsx
  not-found.tsx
  error.tsx
  loading.tsx
  robots.ts
  sitemap.ts
  opengraph-image.tsx
```

- `/` is server-rendered for SEO. A small client `SignedInRedirect` checks `getAccessToken()` after mount and `router.replace('/home')`. It renders nothing; signed-in users may see the landing briefly. This is the simplest correct approach while tokens remain in `localStorage`; no middleware or auth cookie is introduced.
- `(app)/layout.tsx` adds `RequireAuth` (client) so unauthenticated users go to `/onboarding/phone`; admin keeps its own gate.
- Existing `cacheComponents`/Suspense boundaries are preserved. Any `usePathname`/`useParams` consumer stays behind `<Suspense>`.

### 6.2 Game context

- New `GameProvider` in `(app)/layout.tsx` (and on public pages that need it):
  - reads enabled games from `@raise/game-configs` (`efootball`, `codm`, `pubg_mobile`)
  - validates a `?game=` query param, then `localStorage['raise-game']`, then defaults to `efootball`
  - exposes `{ game, games, setGame }`
  - `setGame` updates state, `localStorage`, and `router.replace` with the `game` param (shallow, no scroll)
- `GameSwitcher` becomes a single trigger + sheet bound to context. The trigger opens the sheet and shows the current game. No second hardcoded list.
- Play, Leaderboard, Home, and Profile read the current game; challenge creation defaults to it. Changing the game never requires a full reload.

### 6.3 App shell

- **Desktop ≥1024px:** 72px sticky header across the content area; 240px fixed sidebar; main max 1200px with 24px gutters; active nav item = 3px orange left bar + `accent-subtle` background.
- **Mobile <1024px:** 56px header; 56px bottom nav with Home / Play / Matches / Inbox / Profile; badges for needs-action and unread; safe-area padding; 16–24px gutters; primary action per page stays reachable (sticky footer action on forms).
- `NeedsActionBanner` sits under the header and above content; max one.
- Offline banner reuses the same slot.
- Skip link to `#main`; `main` has `id="main"` and `tabIndex={-1}`.
- Sidebar footer: `UserCard` + Settings + Sign out.

### 6.4 Copy and navigation source

- `lib/copy.ts`: typed constants for route titles, empty states, errors, and landing sections. No JSX strings scattered across pages.
- `lib/nav.ts`: single nav definition consumed by sidebar, bottom nav, and top bar. “Home” → `/home`.
- `AppConfig`: app name, support email, docs links, social links (only if real). No fake links.

---

## 7. Page-by-page plan

Every page below gets: both themes, 320/360/390/768/1024/1280/1440 checks, loading/empty/error, keyboard pass, and a11y axe pass.

### 7.1 Public landing (`/`)

Server component with metadata, canonical, OG image, and JSON-LD (`WebSite` + `Organization`).

Sections, in order:

1. **SiteHeader (72px):** original RAISE wordmark; nav “How it works / Games / Leaderboard / FAQ”; `Sign in` (cream/outline) + `Start playing` (purple). Mobile: wordmark + menu + primary CTA.
2. **Hero:** eyebrow `FREE 1V1 COMPETITION`; `display-xl` two-line headline (“SETTLE IT / IN-GAME.”); subtitle (“Create a challenge, accept one, and let verified results build your reputation. No entry fees. No wallet.”); primary purple `START PLAYING` → `/onboarding/phone`; secondary cream `SEE THE LADDER` → `/leaderboard`; trust line “Free to play · 1v1 only · Moderated disputes”. Original cube cluster on the right; one soft orange glow behind it; no coins.
3. **Games marquee:** text marks `EFOOTBALL · CALL OF DUTY: MOBILE · PUBG MOBILE` + format notes. No publisher logos.
4. **Rule stat cards (3):** `48H / TO ACCEPT`, `24H / TO CONFIRM`, `20MIN / NO-SHOW`. Orange chamfer cards with pixel icons. These are the real product rules, not invented metrics.
5. **How it works (4 steps):** Create → Accept → Play & submit proof → Both confirm. Numbered chamfer tiles; one sentence each.
6. **Purple promo banner:** “READY TO SETTLE IT?” + `CREATE YOUR CHALLENGE` (cream) + cube/rank-token composition. Full-bleed, 1 per page.
7. **Game cards (3):** game name, 1v1 format, score model (goals/kills), room-code note, `View ladder` link. Data from game configs.
8. **“Both players confirm” feature split:** copy + a real composition of `ReputationBadge`, `RankBadge`, and `MatchRow` (not a screenshot). Cream card, purple accent.
9. **FAQ accordion (5):** free to play, proof, no-show, disputes, supported games.
10. **Create CTA card:** “CREATE YOUR CHALLENGE” + short line + purple CTA. Open-lid cube illustration.
11. **SiteFooter:** wordmark, product/legal/support columns, copyright, “Built for competitive players.”

No fake stats, testimonials, or user counts. `SignedInRedirect` handles signed-in visitors.

### 7.2 Home dashboard (`/home`)

Owner-approved content order:

1. **Next action panel** (chamfered, orange): one primary action derived from state (e.g. “Confirm your result”, “Accept your challenge”, “Create your first challenge”). Includes a short reason.
2. **Rank snapshot:** `StatCard` with rating, tier, win rate, and a small trend. Real data.
3. **Live matches:** cards/rows with opponent, game, status, primary action. Empty state → create challenge.
4. **Open challenges:** 3 `ChallengeCard`s matching the current game; horizontal scroll-snap on mobile; `View all`.
5. **Ladder top 5:** compact table, current user’s row pinned if outside top 5; `View ladder`.

Data: `profilesApi.me`, `matchesApi.myMatches`, `challengesApi.list`, `leaderboardApi.get`. Per-block skeletons; per-block error with retry; no whole-page spinner.

Nav “Home” → `/home`. `/status` remains the health page, linked from the footer only.

### 7.3 Onboarding (`/onboarding/*`)

- Bare layout, centered 480px card, step indicator, back link, one primary action.
- Phone → OTP (6 boxes, paste support) → username (availability, rules) → games (multi-select) → game IDs → consent.
- Sticky bottom action on mobile; inline validation; resend timer; errors are text + icon.
- Blocks styling: cream/surface card, orange progress, pixel icons; no app shell.

### 7.4 Play (`/play`)

- `PageHeader`: “Play” + current game + `Create challenge` primary.
- Sticky filter bar: game switcher, format, status, sort.
- 1/2/3 responsive challenge grid; featured first card chamfered.
- Empty state: original cube + “No open challenges in {game}. Create the first one.”
- Loading skeletons matching card anatomy; error retry.

### 7.5 Matches (`/matches`, `/matches/[id]`)

- Tabs: `Needs action`, `Live`, `Completed`; counts; URL-synced.
- Rows: game, opponent, status, time, primary action; mobile stacked cards.
- Match room:
  - mobile: status timeline/summary at top, proof preview, chat, sticky primary action.
  - desktop: 360px summary/actions left, fluid chat/proof right.
  - states: awaiting opponent, awaiting proof, awaiting confirmation, disputed, settled, cancelled.
- No destructive action without a confirm dialog.

### 7.6 Leaderboard (`/leaderboard`)

- Sticky game/period filters.
- Podium top 3: chamfered cards with rank, avatar, username, rating; first place orange, second cream, third purple tint.
- Rows 56px; rank numerals tabular; current user row pinned and highlighted.
- Empty/loading/error; mobile reading width; no horizontal scroll.

### 7.7 Inbox, messages, blocked (`/inbox`, `/messages/[id]`, `/messages/blocked`)

- Tabs: Notifications / Messages / Preferences.
- Unread dot + count; row hover; empty states per tab.
- Chat: bubbles (`surface-2` for them, `accent-subtle` for you), timestamps, attachment preview, disabled composer when blocked, report/block actions.
- Blocked list: unblock with confirm; no dead ends.

### 7.8 Profile (`/profile`, `/profile/[userId]`)

- Header: 64px avatar, username, tier, rating, record, reputation; `Challenge` primary (public profile), `Edit` (own).
- Game IDs section: per game, masked where appropriate, copy button.
- Tabs: Overview / Matches / Achievements (only if data exists; otherwise omit).
- Recent matches: real `matchesApi` data, not mocks. Remove `MOCK_RECENT_MATCHES` and `MOCK_GAME_IDS`.
- Empty state → “Play your first match.”
- Public profile handles 404 and private/blocked states.

### 7.9 Settings (`/settings`) and feedback (`/feedback`)

- Settings sections: Appearance (Dark / Light / System), Notifications, Privacy, Account, Danger zone.
- Theme control writes `raise-theme` and updates `<html class>` + `themeColor` without reload.
- Sign out uses the existing `signOut` flow; “sign out everywhere” confirm.
- Feedback: category, message, optional contact; success state; no fake SLA.

### 7.10 Legal, verify, status

- `/terms`, `/privacy`, `/community-rules`: 640px reading column, `body` 14px, clear headings, updated date, no decorative cards between paragraphs.
- `/verify-email`: bare centered card, success/expired/already-verified states, resend.
- `/status`: the existing health-check UI, restyled; API status, latency, version; auto-refresh with pause; no app nav (site header only).

### 7.11 Admin (14 routes)

- Tokens + shell + table/form restyle only.
- Dense 40px rows, 13px body, 11px labels; no cubes, coins, marquee, or giant display type.
- Admin shell matches app header/sidebar mechanics, but neutral surface hierarchy and no marketing components.
- Preserve all admin actions, filters, pagination, and permission gates.
- Tables: sticky header, numeric alignment, bulk selection, empty/error states.
- Destructive actions: confirm dialog with the exact entity name.

### 7.12 Dev routes

- `/design`: living showcase — colours, type, spacing, radii, chamfer, buttons, inputs, cards, tables, states, both themes, contrast notes.
- `/font-proof`: Unbounded/Space Grotesk specimen at marketing and app scales, long strings, Yoruba diacritics, 320px.
- Both are linked from the footer/dev menu only; not in primary nav.

---

## 8. UX flow checklist (from the UX spec)

- [ ] First visit → landing → Start playing → phone → OTP → username → games → game IDs → consent → Home.
- [ ] Create challenge: game/format → opponent (open/direct) → time window → proof rules → confirm → challenge live.
- [ ] Accept challenge: Play → card → accept confirm → match room → play → submit proof.
- [ ] Submit result: outcome + score + proof → opponent notified.
- [ ] Confirm result: both confirm → settled → rating/reputation update → toast + history.
- [ ] Dispute: reason + evidence → moderator queue → status visible to both.
- [ ] No-show: timer expires → cancel/no-show state → next action.
- [ ] Cancel challenge: allowed only before acceptance; confirm dialog.
- [ ] Inbox: notification → deep link to match; unread clears.
- [ ] Messages: send, receive, block, report, unblock.
- [ ] Profile: own edit; public challenge; game IDs copy.
- [ ] Leaderboard: filter by game; own rank pinned.
- [ ] Settings: theme switch persists; sign out; sign out everywhere.
- [ ] Offline/API error: banner + retry, no dead end.
- [ ] 404/403/500: branded states with a route back.

---

## 9. Original assets

All assets are original and live in `apps/web/public` or as inline SVG components.

| Asset                     | Format                                          | Notes                                                            |
| ------------------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| RAISE wordmark            | SVG                                             | Custom block/pixel lettering; works on dark and light            |
| RAISE mark / favicon      | SVG + PNG                                       | 32/180/192/512; maskable 512                                     |
| OG image                  | 1200×630 PNG or generated `opengraph-image.tsx` | Wordmark, cube cluster, “Free 1v1 challenges”                    |
| Cube cluster              | SVG/CSS                                         | Orange/cream/purple faces, “R” pixel; hero, banner, empty states |
| Rank token                | SVG                                             | Disc with chevrons/numeral, **no `$`**                           |
| Pixel icon set            | Inline SVG                                      | 13 icons at 16/24px, crisp edges                                 |
| Checker band              | CSS                                             | Repeating conic gradient                                         |
| Empty-state illustrations | SVG                                             | 3 variants: no challenges, no matches, no messages               |

No stock photos. No publisher logos. No crypto logos. No copied Blocks assets. No external image domains; CSP stays `img-src 'self' data:`.

---

## 10. Accessibility and performance

### Accessibility (WCAG 2.2 AA)

- Contrast checked in both themes; table of measured pairs in `DESIGN.md`.
- 44×44px minimum touch targets; 24px minimum for desktop-only controls.
- Visible focus ring (2px accent, 2px offset) on every interactive element, including chamfered cards.
- Keyboard: tabs, accordion, sheet/dialog focus trap, dropdown, table selection, skip link.
- Semantics: one `h1` per page, ordered headings, `<nav>` landmarks, `aria-current`, labelled forms, `aria-live` for toasts and async results.
- Status never colour-only; badges include text + icon.
- Reduced motion honoured globally.
- Forms: label above input, help text, inline error with `aria-describedby`, error summary for multi-field forms.
- Screen-reader spot check on landing, Home, Play, match room, and settings.

### Performance

- First-load JS budget: ≤150KB gzip for the landing route; no new animation/UI libraries.
- Fonts: two variable families, latin + latin-ext, display preloaded, body not; ≤120KB total woff2. If over budget, drop Unbounded 800 (keep 900) and body 400/700 only.
- CSS animations only; IntersectionObserver for reveals; no scroll listeners.
- Reserve image/illustration dimensions; no CLS.
- Lighthouse mobile targets: Performance ≥90, Accessibility 100, Best Practices ≥95, SEO ≥95.
- Test on a throttled “Slow 4G / mid-tier mobile” profile and at 320px.

---

## 11. Verification

Run from the repo root; record results in the phase checkpoint.

### Static and unit

```powershell
pnpm --filter @raise/tokens emit:css
pnpm --filter @raise/tokens test
pnpm --filter @raise/web check:tokens
pnpm --filter @raise/web typecheck
pnpm --filter @raise/web lint
pnpm --filter @raise/web test
pnpm --filter @raise/web build
pnpm --filter @raise/web storybook:build
```

### Full stack (API/DB)

```powershell
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm --filter @raise/web test:e2e
```

- `test:e2e` uses `playwright.app.config.ts`; confirm it starts the API or expects it running, and document the exact command.
- If Docker is unavailable, report the blocker with the error; run every non-DB check and do not claim E2E passed.

### Visual and a11y

```powershell
pnpm --filter @raise/web test:visual
pnpm --filter @raise/web test:visual:update   # only when diffs are reviewed
```

- Update snapshots intentionally, page by page, in both themes.
- Axe runs on every route through the existing `e2e/a11y.spec.ts`; add `/`, `/home`, `/status`, and the new states.
- Manual matrix: 320/360/390/768/1024/1280/1440 × dark/light; keyboard-only; reduced motion; offline/API-down.

### Lighthouse

```powershell
pnpm --filter @raise/web build
pnpm --filter @raise/web start
npx lighthouse http://localhost:3000 --preset=desktop --view
npx lighthouse http://localhost:3000 --preset=mobile --view
```

Targets as in §10. Save reports under `test-results/` (ignored).

---

## 12. Commit sequence

One task per commit; each commit must keep typecheck/lint/build green. Contract sync: if a doc changes, it goes in the same commit.

1. `docs(plan): rewrite frontend overhaul for Blocks.fun` — this file, after approval.
2. `feat(tokens): adopt Blocks.fun dark and light token sets` — `tokens.json`, emitter, generated CSS/TS, drift test, `globals.css`, `check:tokens`.
3. `feat(ui): add Blocks.fun primitives and motion` — chamfer, buttons, eyebrow, cards, stat card, pixel icons, cube, rank token, accordion, marquee, page states, stories.
4. `feat(shell): rebuild app shell and shared game context` — route groups, root layout split, shell, nav config, `GameProvider`, `GameSwitcher` fix.
5. `feat(landing): build public landing page` — site header/footer, sections, metadata, OG, `SignedInRedirect`.
6. `feat(home): add signed-in dashboard and status route` — `/home`, `/status`, nav update.
7. `feat(pages): restyle onboarding and core app flows` — play, matches, match room, leaderboard, inbox, messages, profile, settings, feedback.
8. `feat(admin): restyle admin for density` — tokens/shell/table/form only.
9. `fix(profile): use real profile and match data` — remove mocks; wire profile APIs.
10. `fix(manifest): correct icons, shortcuts, and theme colours` — manifest, metadata, robots, sitemap, not-found/error/loading.
11. `test(web): refresh visual and a11y baselines` — reviewed snapshots and axe additions.
12. `docs(design): add DESIGN.md` — how to build, token tables, contrast, component rules.

Phase checkpoints: after 2–4 (foundation), 5–7 (pages), 8–10 (features/fixes), 11–12 (verify/polish). Push to `origin feat/frontend-overhaul` after each phase.

---

## 13. Risks and mitigations

| Risk                                                                | Mitigation                                                                                                            |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Google Fonts fetch fails at build                                   | Vendor the two variable woff2 files and switch to `next/font/local`; keep the same token names.                       |
| Light theme fails contrast (orange-500 on white)                    | Use orange-700 for text/interactive; orange-500 only as a fill with dark text; verify with axe and a contrast script. |
| Chamfer `clip-path` clips focus rings                               | Add inner padding, use `outline` with offset inside the clip, and test keyboard focus on every chamfered control.     |
| 10.5px DS captions too small                                        | Raised to 11px; legal/decorative 10px only.                                                                           |
| `cacheComponents` + client hooks (`usePathname`, `useSearchParams`) | Keep/insert Suspense boundaries; do not read runtime data in `(app)/layout.tsx` without a boundary.                   |
| Visual snapshot churn                                               | Update per page/per theme, review every diff, split commits.                                                          |
| Mobile marquee/floaters hurt performance                            | CSS-only, max 3 elements, pause off-screen, disable under reduced motion.                                             |
| API/DB unavailable for E2E                                          | Start Docker early in Phase 6; if impossible, document the blocker and do not claim E2E passed.                       |
| Admin over-designed                                                 | Density-only rule: no illustration, no display type, 13px body, 40px rows.                                            |
| Long usernames/game IDs break layouts                               | `min-w-0`, truncation, `overflow-wrap:anywhere`; test 320px with worst-case strings.                                  |
| Token drift re-enters via inline styles                             | `check:tokens` + ESLint hex rule + review.                                                                            |
| Existing routes/SEO regressions                                     | Route smoke test; compare metadata before/after; keep canonical URLs.                                                 |

---

## 14. Definition of done

- [ ] All 38 existing routes render; `/` is the landing, `/home` is the dashboard, `/status` is the health page.
- [ ] Blocks.fun tokens are the only source; `tokens.test.ts` and `check:tokens` pass; no raw hex in components.
- [ ] Dark and light themes are complete on every page; system preference works; no FOUC.
- [ ] Marketing uses the Blocks scale; app uses the readable scale; no text below 11px except legal.
- [ ] All components follow the restyle/new rules; Storybook builds and stories render.
- [ ] Every page has loading, empty, error, and mobile states; no mocks or lorem in production paths.
- [ ] `GameSwitcher` lists eFootball, CODM, PUBG Mobile; opens its sheet; persists and syncs selection.
- [ ] `/profile` uses real profile and match data; mocks removed.
- [ ] Manifest, icons, OG image, robots, sitemap, not-found, error, and loading are correct.
- [ ] No crypto/wallet/betting language or imagery; no `$` coins; no publisher logos.
- [ ] Axe: 0 serious/critical on all routes; keyboard pass; reduced motion pass.
- [ ] Lighthouse targets met on mobile.
- [ ] `emit:css`, tokens test, check:tokens, typecheck, lint, test, build, storybook:build, E2E, and visual tests pass.
- [ ] No backend/API contract changes; all routes and SEO metadata preserved.
- [ ] Phase checkpoints committed and pushed; `OVERHAUL_PLAN.md` checkboxes updated.

---

## 15. Open items for owner confirmation (defaults proposed)

1. **Landing signed-in redirect:** client-side check (`getAccessToken`) + `router.replace('/home')`. Default: implement this; no auth cookie or middleware. Confirm if a brief landing flash for signed-in users is acceptable.
2. **Public stats:** no invented metrics. The three landing stat cards use real product rules (48h accept / 24h confirm / 20min no-show). Confirm this semantic substitution.
3. **Fonts:** Unbounded + Space Grotesk, variable, latin + latin-ext. Confirm if the build environment can fetch Google Fonts; otherwise we vendor.
4. **App page titles:** sentence case (not uppercase) for readability at 14px. Confirm.
5. **`/profile/[userId]` privacy:** keep the existing visibility rules; no new fields exposed.
