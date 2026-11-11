# Design System: RAISE (Stage 1)

Draft of November 7, 2026. Companion to the UX Flow Spec. The name and logo are deferred until after the MVP, so nothing here depends on them. Colors, sizes, and thresholds are starting values to verify on real devices.

## 1. Principles

- Trust first. The UI makes results, rules, and next actions unambiguous. Nothing looks like a casino.
- Sharp, not noisy. Hard geometry and a techy display face carry the identity. Decoration is rare and cheap to render.
- Built for the real device. A low-end Android on throttled 3G in bright daylight is the reference. If it works there, it works everywhere.
- One next action. Every screen has a single obvious primary action.
- State is never color alone. Color, icon, and label always travel together.

## 2. Color

Dark is the default theme and light is fully supported. Verify every pairing with a contrast checker during implementation. Targets: 4.5:1 for text, 3:1 for large text and UI boundaries.

### Dark theme

| Token         | Value                 | Use                                                 |
| ------------- | --------------------- | --------------------------------------------------- |
| bg-0          | #0A0C10               | Page background                                     |
| bg-1          | #11151B               | Surfaces, cards                                     |
| bg-2          | #181D25               | Raised: sheets, popovers, inputs                    |
| bg-3          | #202733               | Hover, pressed, selected row                        |
| border        | #2A3340               | Default hairline                                    |
| border-strong | #3B4758               | Emphasis, table headers                             |
| text-1        | #E8EDF4               | Primary text                                        |
| text-2        | #A3AFBF               | Secondary text                                      |
| text-3        | #6B7788               | Disabled and placeholder only, never essential text |
| accent        | #22D3EE               | Interactive elements, links, focus                  |
| accent-hover  | #67E8F9               | Hover                                               |
| accent-press  | #06B6D4               | Pressed                                             |
| accent-subtle | rgba(34,211,238,0.12) | Tinted backgrounds                                  |
| on-accent     | #031316               | Text on accent fills                                |

### Light theme

| Token         | Value                 |
| ------------- | --------------------- |
| bg-0          | #F6F8FA               |
| bg-1          | #FFFFFF               |
| bg-2          | #EEF2F6               |
| bg-3          | #E3E9F0               |
| border        | #D3DAE3               |
| border-strong | #A9B4C2               |
| text-1        | #0E141B               |
| text-2        | #4A5666               |
| text-3        | #7A8798               |
| accent        | #0E7490               |
| accent-hover  | #155E75               |
| accent-subtle | rgba(14,116,144,0.10) |
| on-accent     | #FFFFFF               |

The light accent is darker because bright cyan fails contrast on white.

### Status colors (reserved, semantic use only)

| Meaning | Dark    | Light   |
| ------- | ------- | ------- |
| Win     | #34D399 | #047857 |
| Loss    | #F87171 | #B91C1C |
| Dispute | #FBBF24 | #B45309 |

- Win and loss describe outcomes for the viewer. Dispute describes a process state.
- Neutral states use text-2 and border. Needs-your-action uses the accent.
- Never use these hues for decoration, brand, or non-semantic chart series.
- Rank tiers are shown by shape (notches) and label, not hue, so they never collide with status colors.

Scrim: rgba(0,0,0,0.6) in dark, rgba(14,20,27,0.45) in light.

## 3. Typography

- Display face: Chakra Petch (weights 500, 600, 700) for headings, numerals, buttons, chips, tabs, and nav labels.
- Body face: the system UI stack, which costs no download.

```css
--font-display: 'Chakra Petch', ui-sans-serif, system-ui, sans-serif;
--font-body:
  ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
```

| Token   | Size / line | Weight | Face                                | Use                      |
| ------- | ----------- | ------ | ----------------------------------- | ------------------------ |
| display | 32 / 36     | 700    | Display                             | Rare screen heroes       |
| h1      | 24 / 28     | 600    | Display                             | Screen titles            |
| h2      | 20 / 24     | 600    | Display                             | Section titles           |
| h3      | 16 / 20     | 600    | Display                             | Card titles, buttons     |
| body    | 16 / 24     | 400    | Body                                | Default text             |
| body-sm | 14 / 20     | 400    | Body                                | Dense text, helper text  |
| caption | 12 / 16     | 500    | Body                                | Timestamps, hints        |
| label   | 12 / 16     | 600    | Display, uppercase, 0.06em tracking | Chips, tabs, badges only |
| stat-lg | 28 / 32     | 600    | Display, tabular                    | Rating, rank             |
| stat-md | 18 / 24     | 600    | Display, tabular                    | Scores, record           |

Rules:

- Inputs are never below 16px, which prevents iOS zoom on focus.
- Sentence case everywhere except the label style.
- Numerals are tabular wherever numbers line up (ratings, scores, leaderboards). If Chakra Petch lacks usable tabular figures at 12 to 14px, digits use a mono face such as Share Tech Mono. Decide after a device test.
- Self-host Latin and Latin Extended subsets as woff2 with font-display swap. Extended coverage matters for Yoruba characters (ẹ, ọ, ṣ) in usernames. Verify they render before locking the font.
- Preload only the display font file used above the fold. Skip Orbitron: it is wide, cliche, and poor for numeric tables.

## 4. Spacing, layout, and shape

### Spacing and layout

- Scale on a 4px base: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Component padding is 12 to 16. Section gap is 24.
- Page margins: 16 on mobile, 24 on tablet, 32 on desktop.
- Breakpoints: base 360 (functional down to 320), sm 640, md 768, lg 1024, xl 1280. Maximum content width 1200, reading column 640.
- Grid: 4 columns on mobile, 8 on tablet, 12 on desktop, with 16 or 24 gutters.
- Navigation: bottom nav (56px plus safe-area inset) on mobile, and a 240px left sidebar collapsing to 72px icons on larger screens.
- Two-pane layouts from 1024: the match room (timeline left at 360px, chat right) and the admin dispute viewer (evidence left, decision panel right at 360px).
- Touch targets are at least 44 by 44, with at least 8px between adjacent targets.

### Radius, borders, and elevation

- Radius scale: 0 for tables and dividers, 2 for buttons, chips, badges, and avatars, 4 for cards, inputs, sheets, and toasts, 6 for modals as the maximum. No pill shapes and no round avatars. Status dots are the only circles.
- Borders: 1px hairline by default, 2px accent for selected cards. Focus ring is a 2px accent outline with 2px offset and is never removed.
- Chamfer: 6px cut corners on the rank badge, plus small corner ticks on featured cards. Never on inputs, buttons, or anything carrying a focus ring.
- Elevation comes from the surface steps (bg-0 to bg-3) plus a border. Shadows only on floating layers: 0 8px 24px rgba(0,0,0,0.4) in dark and 0 8px 24px rgba(14,20,27,0.15) in light.
- Glow: 0 0 0 1px accent plus 0 0 12px rgba(34,211,238,0.35), used only on the rank badge and the win-confirmed state. Never animate box-shadow.

## 5. Motion

- Durations: 100 ms for micro interactions, 160 ms default, 240 ms for sheets and route changes. Easing cubic-bezier(0.2, 0, 0, 1).
- Animate transform and opacity only.
- With prefers-reduced-motion, remove non-essential motion, make transitions instant, and render skeletons static.
- Loading: skeletons for lists and cards. Spinners only inside buttons.
- One signature moment: on the result-confirmed screen the rating change counts up over 240 to 400 ms (disabled under reduced motion).

## 6. Iconography and imagery

- Inline SVG from a tree-shaken set (Lucide through shadcn). Sizes 16, 20, 24. Stroke 1.5 with square caps and miter joins where the set allows. No icon fonts.
- Status icons: circle (Open), check (Accepted), play (In progress), clock (Awaiting), alert-triangle (Disputed), check-circle (Confirmed, Resolved), ban (Cancelled), hourglass (Expired), flag (Forfeited), undo (Voided).
- Game identity uses text labels and neutral monograms until publisher terms are confirmed. No publisher logos or art.
- Avatars are square with a 2px radius and initials fallback. Stage 1 default is a generated pattern from the username (uploads are an open decision).
- No imagery of cash, money rain, or casino motifs anywhere.
- Screenshots are untrusted user content: EXIF stripped, hashed, displayed through signed URLs.

## 7. Status model

One model feeds chips, the match timeline, and banners.

| Match state                           | Display group | Chip label                                  | Treatment                                     |
| ------------------------------------- | ------------- | ------------------------------------------- | --------------------------------------------- |
| Open                                  | Open          | Open                                        | Neutral                                       |
| Accepted                              | Scheduled     | Accepted                                    | Neutral                                       |
| In progress                           | Live          | In progress                                 | Neutral with accent dot                       |
| Awaiting result                       | Awaiting      | Awaiting result                             | Neutral. Accent fill when the viewer must act |
| Awaiting confirmation                 | Awaiting      | Needs confirmation, or Waiting for opponent | Accent when the viewer must act               |
| Confirmed                             | Done          | Confirmed                                   | Neutral                                       |
| Disputed                              | Disputed      | Disputed                                    | Dispute color                                 |
| Resolved                              | Done          | Resolved                                    | Neutral                                       |
| Cancelled, Expired, Forfeited, Voided | Muted         | Matching label                              | text-2                                        |

- Win and Loss are separate outcome tags in their own colors and appear only on finished matches.
- A needs-your-action banner always uses the accent.

## 8. Components

### Button

- Variants: primary (accent fill, on-accent text), secondary (1px border-strong), ghost (accent text), danger (loss color border and text).
- Sizes: sm 32 (admin tables only), md 44 (default), lg 48 (primary action in sticky bars).
- Label style: h3 weight, sentence case, verb first (Accept challenge, Submit result).
- States: default, pressed (accent-press or bg-3), focus ring, disabled (40% opacity, with helper text explaining why), loading (spinner replaces the label at fixed width, aria-busy). No hover dependence on touch.
- One primary per screen. Full width in sheets and sticky bars on mobile.

### Input and OTP

- Height 44, radius 4, bg-2, 1px border, label above (body-sm), helper or error below (caption, with icon).
- Error: loss-colored border plus icon plus text. Never color alone. Focus: accent outline.
- Numeric fields use inputmode numeric. Selects use the native control on mobile.
- Phone: +234 prefix by default. Proposed: accept the local leading-zero format and normalize it.
- OTP: six cells of 44 by 52, autocomplete one-time-code, paste fills all cells, auto-advance, resend after 30 seconds with a visible countdown, and a plain-text error.

### Status chip

- Height 24, horizontal padding 8, radius 2, 1px border, 14px icon plus label style. Variants: neutral, accent, dispute, win, loss, muted. Never interactive.

### Match timeline

- Vertical stepper in the match room, with a compact horizontal summary at the top on mobile.
- Steps: Accepted, Play, Submit result, Confirm, Done.
- Step states: done (check), current (accent marker plus deadline countdown), upcoming (text-3 marker), blocked (dispute marker with an inline Dispute branch).
- Countdown shows relative time, with the absolute time on tap. All times display in the user's timezone (WAT by default).

### Challenge card

- Surface bg-1, 1px border, radius 4, padding 16.
- Row 1: game and format chip (left), stake slot (right). The slot reads Free in Stage 1 and shows tabular amount plus currency later.
- Row 2: poster avatar (32), username, rating badge, record (W-L), reputation badge.
- Reserved slot between rows 2 and 3 for the Stage 2 rating-gap indicator. It is collapsed in Stage 1 so the layout does not change later.
- Row 3: time window and expiry.
- Row 4: Accept (primary, md) and Details (ghost).
- States: default, hover on desktop (border-strong), pressed (bg-3), expired (muted, Accept disabled with reason), mine (labeled Your challenge, Cancel replaces Accept). Featured cards get corner ticks.

### Rating, rank tier, and reputation badges

- Rating badge: stat-md number, with a hollow Provisional marker until enough rated matches (proposed: 10). Screen-reader label includes the word provisional.
- Rank tier: chamfered badge with 1 to 5 notches plus a label. Color is accent only, and tier 5 adds the glow. Working tier names: Rookie, Challenger, Contender, Elite, Champion.
- Reputation badge: New, Low, Reliable, Trusted, based on completion and dispute rates (thresholds to be set in the product rules). Low uses an alert icon in text-2, not the dispute color. Never shows raw penalty numbers.

### Leaderboard row

- Height 56 on mobile. Columns: rank, avatar and username, rating, W-L, trend. Tabular numerals.
- The viewer's own row pins to the bottom when outside the viewport.
- Sticky filters: game, campus or city, period (later). The top three rows get an accent notch.

### Player profile header

- Avatar 64, username, game ID chips with a copy button (confirm with a toast), per-game tabs, stat grid (rank, rating, record, streak, reputation), recent matches. On mobile the Challenge button is a sticky primary action.

### Result submission sheet

- Bottom sheet on mobile, modal on desktop.
- Content: outcome selector (I won, I lost, draw if the game allows, opponent no-show), score steppers driven by the game config, screenshot upload (camera or gallery) with client-side compression, progress, retry, and remove, an optional note (200 characters), and a summary line.
- Summary copy is driven by the rules config, for example: Your opponent has 24 hours to confirm. If they do not respond, the result is confirmed automatically.
- States: uploading, offline (queue and retry), failed (retry), submitted.

### Match chat

- Bubbles with radius 4. Own messages right-aligned on accent-subtle, others on bg-2. System messages are centered caption text in text-2.
- Attachments show as 96px thumbnails. Message states: sending, sent, failed with retry.
- Composer minimum height 44, 500-character limit, no link previews. Report and block live in the message overflow menu.
- Locked state: a banner reading Chat is closed, with the composer removed.

### Notification item

- Icon, title (body-sm, 600), time (caption), unread dot in accent. Tapping opens the related object. Grouped by day. No swipe-only actions.

### Bottom navigation

- Five items (Home, Play, Matches, Inbox, Profile), 56px plus safe-area inset, 24px icon with an always-visible 12px label.
- Active item: accent icon plus a 2px top bar. Badges: a dot for new items or a count up to 99+. The Matches badge counts items needing action.

### Banners and toasts

- Banners: needs-action (accent), offline (neutral with icon), system (neutral). They persist until resolved.
- Toasts: 4 seconds, above the bottom nav, role status. Errors persist until dismissed or resolved. Never use a toast for critical information.

### Sheets and modals

- Mobile bottom sheet with radius 4 on top corners, maximum height 90 percent, scrim, focus trap, and dismissal by back or Escape. Desktop modal at 480 or 640 width.
- Destructive confirmations use an explicit verb button (Cancel challenge), never OK.

### Tables (admin)

- Row height 40, sticky header on bg-2 with border-strong, left-aligned text and right-aligned tabular numerals, hover on bg-3, selected row gets a 2px accent left border.
- Bulk-action bar, pagination (25, 50, 100), full keyboard navigation, empty and error states.

### Admin dispute viewer

- Header: match id, game, both players with rating and reputation, and the SLA clock.
- Evidence panels side by side on desktop and tabbed on mobile: each submission with outcome, score, timestamp, zoomable screenshots, and hash flags (for example, Reused screenshot with a link to the earlier match). Also the chat transcript and each player's dispute history.
- Decision panel: outcome, reason template, internal notes, and a sanction toggle showing the ladder step.
- A confirmation dialog summarizes effects (ratings now, holds and payouts in Stage 2) before the ruling is applied.
- Queue states: unassigned, assigned, awaiting info, resolved.

### Empty states

- 32px icon, h3 title, one body-sm line, one primary action. Example: No open challenges for this game yet. Create one.

## 9. Content and microcopy

- Voice: direct, calm, confident. Say what happened and what to do next.
- Preferred words: challenge, match, result, dispute, rating. Avoid bet, wager, jackpot, odds, and win big. In Stage 2, any stake or fee copy states amounts and fees explicitly before the user confirms.
- Formats: times with a timezone abbreviation (WAT), dates like Sat 7 Nov, 6:30 pm, numbers with thousands separators, currency shown with the naira sign in the UI and an ISO code in data.
- Errors: Could not upload the screenshot. Check your connection and try again.
- Local flavor (including light Pidgin) is allowed only in optional, non-critical copy such as empty states, and only through i18n strings. Never in rules, disputes, or payments.
- All strings go through i18n from day one. Leave 30 percent extra room for text growth.

## 10. Accessibility

- WCAG AA contrast, visible focus on every interactive element, 44px targets, and logical focus order.
- Color is never the only signal for status, errors, or required actions.
- Screen-reader labels for rank, rating, and status, for example: Rating 1,284, provisional.
- Live updates from the WebSocket (new message, state change) announce politely through aria-live. Critical messages never auto-dismiss.
- Support 200 percent text zoom and prefers-reduced-motion. All flows work with keyboard only on desktop.

## 11. Performance budget

These are targets, to be measured on a low-end Android over throttled 3G.

- First load under 3 seconds (matches the PRD acceptance criterion). Initial route JavaScript at or under about 150 KB gzipped.
- Fonts: Latin and Latin Extended subsets of the display face at the weights actually used, within a small budget (target 40 KB total).
- Screenshots are compressed client-side before upload to about 300 KB or less, with the longest edge at 1280px. Thumbnails are generated for lists, and images lazy-load.
- No backdrop-filter or large blurs. No animated shadows. No video backgrounds. No icon fonts.

## 12. Implementation

- Tokens live as the source of truth in packages/tokens (JSON). A build step emits CSS variables for web and typed constants for the later React Native app.
- Components build on Tailwind and shadcn/ui, themed by overriding CSS variables. Tailwind radius scale is overridden to 2, 4, and 6px.
- Theme is set by a data-theme attribute. Default is dark. A system option follows prefers-color-scheme. The choice is stored on the profile and in the browser.

```css
:root,
[data-theme='dark'] {
  --bg-0: #0a0c10;
  --bg-1: #11151b;
  --bg-2: #181d25;
  --bg-3: #202733;
  --border: #2a3340;
  --border-strong: #3b4758;
  --text-1: #e8edf4;
  --text-2: #a3afbf;
  --text-3: #6b7788;
  --accent: #22d3ee;
  --accent-hover: #67e8f9;
  --accent-press: #06b6d4;
  --on-accent: #031316;
  --win: #34d399;
  --loss: #f87171;
  --dispute: #fbbf24;
  --radius: 4px;
}
[data-theme='light'] {
  --bg-0: #f6f8fa;
  --bg-1: #ffffff;
  --bg-2: #eef2f6;
  --bg-3: #e3e9f0;
  --border: #d3dae3;
  --border-strong: #a9b4c2;
  --text-1: #0e141b;
  --text-2: #4a5666;
  --text-3: #7a8798;
  --accent: #0e7490;
  --accent-hover: #155e75;
  --accent-press: #164e63;
  --on-accent: #ffffff;
  --win: #047857;
  --loss: #b91c1c;
  --dispute: #b45309;
}
```

shadcn variable mapping:

| shadcn variable      | Token     |
| -------------------- | --------- |
| --background         | bg-0      |
| --foreground         | text-1    |
| --card               | bg-1      |
| --popover            | bg-2      |
| --primary            | accent    |
| --primary-foreground | on-accent |
| --muted              | bg-2      |
| --muted-foreground   | text-2    |
| --border, --input    | border    |
| --ring               | accent    |
| --destructive        | loss      |
| --radius             | 4px       |

## 13. Governance

- Storybook documents every component with the a11y addon. Playwright visual regression runs on key components.
- Definition of done per component: all states, dark and light, 360 and 1024 widths, keyboard use, reduced motion, and i18n text growth.
- Token changes go through pull requests with a changelog. New components must reuse existing tokens before adding any.
- Name and logo: use a plain text wordmark in the display face (weight 700) as a placeholder until the brand is chosen after the MVP.

## 14. Open decisions

- Confirm the cyan accent (violet is the fallback).
- Final display font after the numerals and Yoruba character test (alternatives: Rajdhani, Oxanium).
- Tier names, provisional threshold, and reputation thresholds.
- Whether profile photo uploads exist in Stage 1.
- Phone number normalization rules.
- Whether any Pidgin microcopy ships at launch.
- Icon set final choice and the chamfer treatment, after the first on-screen review.
