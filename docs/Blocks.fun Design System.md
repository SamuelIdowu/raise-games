# Blocks.fun Design System

Reverse-engineered from the landing page screenshot. All hex values, sizes and fonts are visual estimates (assumed 1440px desktop frame). Verify with an eyedropper or the live CSS before shipping, and treat font names as closest matches.

## 1. Brand Foundations

**Personality:** gamified, loud, playful crypto. Heavy extended display type, pixel-art icons, isometric 3D cubes and a hot orange against near-black, with purple as the secondary brand voice.

**Design principles**

- **Dark stage, hot accents.** The canvas is almost black so orange and purple do all the talking.
- **Blocky and pixel-native.** Chamfered corners, pixel icons, checker patterns and cubes echo the mining/blocks metaphor.
- **Big numbers, small labels.** Data is shown as huge white numerals with tiny uppercase captions.
- **Uppercase microcopy.** Labels, nav and body snippets are uppercase and letter-spaced, giving an arcade/terminal feel.
- **Trust through clarity.** Short 4-step explainers, "safe and protected" reassurance lines and on-chain proof copy balance the playfulness.

## 2. Color

### 2.1 Core palette

**Neutrals (dark UI)**

- `--bg-0` #0A0C0D: page background (near-black with a faint green-gray tint)
- `--bg-1` #111314: section/banding background
- `--surface-1` #17191A: card base
- `--surface-2` #202223: card gradient end / raised surface
- `--border` #232628: hairline dividers and card outlines (about rgba(255,255,255,0.08))
- `--border-strong` #34383B: hover outlines

**Text**

- `--text-1` #FFFFFF: headings, numerals, active text
- `--text-2` #B8BCC0: secondary text on cards
- `--text-3` #7C8186: descriptions, captions, inactive nav (this is the screenshot's gray body copy)
- `--text-4` #4F5459: collapsed FAQ questions, disabled

**Brand orange (primary)**

- `--orange-300` #FF9A66
- `--orange-400` #FF7433
- `--orange-500` #FF4F00: stat cards, primary buttons, markers, active underline
- `--orange-600` #E04400: pressed
- `--orange-700` #A83300: pixel-art shading

**Brand purple (secondary)**

- `--purple-300` #C08BFF
- `--purple-400` #A25CFF
- `--purple-500` #8A2BFF: CTA banner, hero primary button, fee badges, highlighted words
- `--purple-600` #7016E0: pressed
- `--purple-900` #2A0F55: glow base behind the "Create Your Own Mine" card

**Light surfaces (buttons)**

- `--cream` #F1EEE8: default secondary buttons (Connect Wallet, Enter Mine)
- `--white` #FFFFFF: buttons on colored banners

**Semantic**

- `--success` #A3E635: live/APR status dot (lime)
- `--warning` #FFC93C: coin yellow
- `--danger` #FF3B3B: losing bet, errors (not shown; recommended)
- `--info` #8A2BFF: reuse purple

### 2.2 Gradients

- **Card surface:** `linear-gradient(180deg, #202223 0%, #141617 100%)`
- **Purple spotlight:** `radial-gradient(60% 55% at 50% 0%, #6A1FE0 0%, #2A0F55 45%, #17191A 100%)` for the Create Your Own Mine card
- **Hero glow (optional):** `radial-gradient(40% 30% at 50% 0%, rgba(255,79,0,0.12), transparent)`
- **Highlight word fill:** purple-to-lavender, `linear-gradient(90deg, #8A2BFF, #B57BFF)`, clipped to text ("Blocks.fun" in the Learn More heading)

### 2.3 Color usage rules

- Orange = action + data highlight (stat cards, "Enter Mine" on the featured mine, step counters).
- Purple = brand moments (primary hero CTA, banners, fee tiers, spotlight card).
- One saturated color per component. Do not mix orange and purple inside the same card, except for illustration.
- Never put gray `--text-3` on orange or purple; use white or black.
- Max one full-bleed colored banner per viewport.

### 2.4 Accessibility notes

- `--text-3` (#7C8186) on `--bg-0` is about 4.9:1: OK for body, borderline at 10-11px. Keep text above 11px or lift to #8D9297.
- `--text-4` is decorative/secondary only (about 2.7:1). Collapsed FAQ questions should use `--text-3` for real use.
- White on `--orange-500` is about 3.3:1: acceptable only for large numerals and bold labels; use #0A0C0D on orange for small text.

## 3. Typography

### 3.1 Families

- **Display:** ultra-heavy extended grotesque, tight leading, uppercase for hero/section titles. Closest free matches: **Unbounded (Black 900)** or **Dela Gothic One**; fallback `Impact, sans-serif`.
- **UI / Body:** clean geometric sans, set mostly uppercase with tracking. Closest matches: **Space Grotesk**, **Familjen Grotesk** or **Sora**.
- **Mono (optional):** **JetBrains Mono** for wallet addresses, tx hashes, odds.

### 3.2 Type scale (desktop 1440 / mobile 390)

- `display-xl` hero H1: 80px / 0.9 line-height / weight 900 / uppercase / tracking -0.02em. Mobile 44px.
- `display-lg` stat numerals: 56px / 1 / 900. Mobile 40px.
- `h2` section titles ("HOW IT WORKS", "EXPLORE MINES", "FAQ"): 40px / 1 / 900 / uppercase. Mobile 28px.
- `h2-mixed` ("Learn more about Blocks.fun", "Create Your Own Mine"): 40px / 1 / 900 / mixed case. Mobile 28px.
- `h3` step titles: 16px / 1.2 / 700 / uppercase / tracking 0.02em.
- `metric` card values (87,900, 60%): 22px / 1 / 800.
- `body-lg` hero subtitle, banner copy: 14px / 1.5 / 500, normal case.
- `body` paragraphs in Learn More: 12-13px / 1.6 / 500, normal case.
- `caption-upper` step descriptions, FAQ answers: 10.5px / 1.5 / 500 / uppercase / tracking 0.04em / `--text-3`.
- `label` eyebrows, stat captions, nav: 11px / 1 / 600 / uppercase / tracking 0.12em.
- `button` 11-12px / 1 / 700 / uppercase / tracking 0.06em.
- `legal` footer: 9px / 1.4 / 500 / `--text-4`.

### 3.3 Rules

- Display type is always tightly leaded and stacked on two lines when possible ("GRIND YOUR / BLOCKS").
- Eyebrows sit above headings with a 6x6 orange square bullet (a pixel marker) in front of the label.
- Highlighted brand words inside a heading use the purple gradient fill.
- Do not italicize, except FAQ open answer (italic uppercase caption).

### 3.4 Next.js font setup

```ts
import { Unbounded, Space_Grotesk } from 'next/font/google';
export const display = Unbounded({
  subsets: ['latin'],
  weight: ['800', '900'],
  variable: '--font-display',
});
export const sans = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});
```

## 4. Spacing, Layout and Grid

### 4.1 Spacing scale (4px base)

`2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128`

- Section vertical padding: 96-128px desktop, 64px mobile.
- Heading to content: 32-48px.
- Card inner padding: 16-20px (mine cards), 24-32px (stat cards).
- Gap between cards: 16-24px.

### 4.2 Containers

- **Header / footer:** full-width, 48px horizontal padding (logo left edge aligned to the viewport gutter).
- **Content container:** about 880px max (about 60% of a 1440 frame), centered. Hero, stats, steps, banner, mines, FAQ and the Create card all share this width.
- **FAQ and Create card:** the FAQ column is narrower (about 560px) and left-aligned inside the container; the Create card spans the full container.
- Hero artwork (floating cubes) may overflow the container and extend into the gutters.

### 4.3 Grid

- 12-column grid, 24px gutter inside the 880px container.
- Stat cards: 3 columns (4/4/4).
- Steps: 2 columns x 2 rows (6/6), 64px row gap.
- Mine cards: 3 columns (4/4/4).
- Learn More: 2 columns, illustration 5 / copy 6 with 1 col offset.

### 4.4 Breakpoints

- `sm` 640 / `md` 768 / `lg` 1024 / `xl` 1280 / `2xl` 1536
- Mobile (<768): 1 column everywhere, cubes shrink to 60% and move behind the hero, stat cards become a horizontal scroller or stack, partner logos become an auto-scrolling marquee.
- Tablet (768-1023): stats 3 col, mines 2 col + 1 wrapped, steps 2 col.

### 4.5 Dividers

- 1px `--border` hairlines separate major sections (below stats, around the banner, above Explore Mines).
- The pixel checker band (full-bleed, 24px tall, `--surface-1` pixel "X" pattern on `--bg-0`) marks the move from the main product area to FAQ.

## 5. Shape, Elevation, Borders

### 5.1 Radius

- `--r-xs` 4px: pixel badges, fee tier chips
- `--r-sm` 6px: buttons
- `--r-md` 12px: mine cards, FAQ items
- `--r-lg` 16px: Create Your Own Mine card, CTA banner
- `--r-pill` 999px: Trending badge, status chips

### 5.2 Chamfered (notched) corners

Signature element. Stat cards and the purple banner cut the top-right corner at 45 degrees and show a pixel "bite" on the opposite corner of the banner.

```css
.chamfer-tr {
  clip-path: polygon(0 0, calc(100% - 28px) 0, 100% 28px, 100% 100%, 0 100%);
}
.chamfer-tr-sm {
  --c: 16px;
  clip-path: polygon(0 0, calc(100% - var(--c)) 0, 100% var(--c), 100% 100%, 0 100%);
}
```

A 2px darker inner triangle (orange-700 on orange cards) sells the folded-paper effect.

### 5.3 Borders and elevation

- Cards on dark: 1px `--border`, no drop shadow. Depth comes from the gradient surface and a subtle inner top highlight (`inset 0 1px 0 rgba(255,255,255,0.04)`).
- Colored banners: no border, no shadow.
- Floating illustrations: soft colored glow, `drop-shadow(0 12px 24px rgba(255,79,0,0.25))` for orange items, `rgba(138,43,255,0.35)` for purple.
- Spotlight card: purple radial gradient at top, bottom fades into `--surface-1`.

## 6. Iconography and Illustration

### 6.1 Pixel icons

- 16x16 / 24x24 grid, chunky 2px pixels, no anti-aliasing (`image-rendering: pixelated` for raster, `shape-rendering: crispEdges` for SVG).
- Used on stat cards (cursor arrow, heart, coin), step headers (gem, hand, flame, crown), FAQ speech bubble.
- Color: orange on dark, white-on-orange with a black pixel outline on orange cards.

### 6.2 UI icons

- Arrow-up-right for external/CTA (14px, 2px stroke, inherits text color).
- Pickaxe with sparkle for Enter Mine.
- Plus / close (x) for accordion, 14px, `--text-3`.
- Shield-check for the "safe and protected" line.
- Flame for hot mine messaging.
- Social: X, Discord, Telegram, 18px, white, 24px gap.

### 6.3 3D isometric cubes

- Brand mascot: a Rubik-style cube made of orange, white and purple faces, printed with the logo X, "$" and small floating stats like "+0.36" and "+86%".
- Variants: single floating cubes in orange, white and purple used in the hero corners, rotated 15-30 degrees; a cube with an open lid for the Create card.
- Coins: white discs with a black "$" and a purple/orange edge, scattered and rotated.
- Motion: slow float (6-8s ease-in-out loop, 8-12px translateY) plus slight rotate.

### 6.4 Token avatars

- 24px circle, token art (Bonk yellow, SOL purple gradient, WIF purple). Small 12px token glyph repeats next to metric values.

## 7. Components

### 7.1 Logo

Orange pixel "X" cluster mark + wordmark "BLOCKS.FUN" in display font, white, 18px. Min clear space = height of the X.

### 7.2 Header / Navigation

- Height 72px, bottom hairline `--border`, transparent over page.
- Left: logo, then 1px vertical separator, then nav items: HOME, GAME, STATS, LEADERBOARD.
- Nav item: label style, `--text-3`; active = `--text-1` with a 2px orange underline spanning the item width, sitting on the header border.
- Right: tiny two-line caption ("Start playing the game and", 9px, `--text-4`) and the **Connect Wallet** button (cream).
- States: hover text to `--text-1`; focus ring 2px `--orange-400` offset 2px.
- Mobile: hamburger, drawer with large uppercase links, wallet button full width.

### 7.3 Buttons

Shared: height 36px (sm 32 / lg 44), padding 0 16px, radius 6px, label type, trailing arrow-up-right icon (12px, 8px gap).

- **Primary purple:** bg `--purple-500`, text white. Hover `--purple-400`, pressed `--purple-600`.
- **Primary orange:** bg `--orange-500`, text white (or #0A0C0D for small). Hover `--orange-400`, pressed `--orange-600`. Used in the Learn More and highlighted "Enter Mine".
- **Secondary cream:** bg `--cream`, text #0A0C0D. Hover #FFFFFF. Used for Connect Wallet, View Leaderboard, Enter Mine (default).
- **On-banner white:** bg #FFFFFF, text #0A0C0D, over purple/spotlight.
- **Disabled:** bg `--surface-2`, text `--text-4`, no arrow animation.
- **Loading:** swap the icon for a 12px pixel spinner, keep width.
- Motion: arrow translates 2px up-right on hover (120ms); button translateY(-1px) on hover, 0 on press.
- Min touch target 44px on mobile.

### 7.4 Eyebrow label

A 6x6 orange square (the pixel marker, sometimes with a small trailing notch), 8px gap, label text in white at 11px uppercase. Used above H1 ("PLAY AND EARN"), "LEARN", "BUILT ON CHAIN, BUILT FOR TRUST", "BUILD AND OWN".

### 7.5 Hero

- Centered stack: eyebrow, H1 (2 lines), subtitle (max-width 360px, centered), two buttons side by side with 12px gap, trust microcopy (shield icon + `--text-4` 10px).
- Padding top 64px, bottom 48px.
- Decoration: four floating cubes at the left top, left bottom, right top and right bottom of the viewport; tiny orange/purple pixel crosses scattered in the dark background at 4-6% opacity.

### 7.6 Partner marquee

Single row of grayscale logos (WITCH, CULT, B.A.S.E, Quest Mate, Beyond Frames), height 20px, 48px gap, color `--text-3` (opacity 0.7), hover to white. Infinite horizontal scroll (30s linear), edge fade to `--bg-0`.

### 7.7 Stat Card

- Size: about 190x110 (grid of 3). Background `--orange-500`, chamfered top-right (28px), with a pixel icon sitting in the notch area, rotated slightly.
- Top-left: caption (label type, 10px, rgba(0,0,0,0.65) or white at 85%).
- Bottom-left: numeral (`display-lg`, white). Counts up on first view (1.2s ease-out).
- Hover: lift 2px, icon wiggles 6 degrees.

### 7.8 Step item (How It Works)

- Header row: a segmented progress bar of 8 slanted orange segments (the first segments filled in proportion to the step number, so 001 = 1/4 filled... represented visually as a barcode stripe), followed by the number "001" in orange mono-like caps (11px). Right of the number, a small pixel icon in orange.
- Title: `h3`, white, 12px below header.
- Description: `caption-upper`, `--text-3`, max-width 300px.
- No card background; items float on the page. Row gap 64px, col gap 48px.

### 7.9 Promo banner (Get Started Now)

- Full container width, height about 200px, bg `--purple-500`, radius 16px, chamfered/pixel-bitten corners on top-left and bottom-left (small black pixel blocks).
- Left: eyebrow (white), title "GET STARTED NOW!" (display, 30px, white), copy (white 11px), white button.
- Right: cluster of 5 coins at varied sizes and rotation, overlapping the edge of the banner.

### 7.10 Feature split (Learn more)

- Left: large isometric cube illustration (about 300px).
- Right: eyebrow, H2 (mixed case, brand word in purple gradient), two paragraphs in `--text-2`, orange CTA.
- Vertical center aligned. On mobile the illustration stacks above the copy.

### 7.11 Mine Card

- Size: about 190w x 270h. bg card gradient, border `--border`, radius 12px, padding 16px.
- **Header:** 24px token avatar, name (14px, 700, white), below it a fee tier chip ("FEE TIER 2%"): purple tint bg rgba(138,43,255,0.2), text `--purple-300`, 8px caps, radius 4px.
- **Trending badge** (optional, top-right): pill, bg rgba(255,79,0,0.15), orange text, flame icon.
- **Metrics grid 2x2:** label (`--text-3`, 9px, mixed case) over value (22px 800 white) with a 12px token glyph. Metrics: Liquidity, Max Win, Volume (24H), APR (with lime dot and a small % unit).
- **Hot line:** flame icon plus 8px `--text-3` copy: "This is hot mine. 22 bets in the past hour!". Appears only for active mines.
- **CTA:** full-width Secondary cream button "ENTER MINE" with pickaxe icon; the featured/hovered card uses Primary orange.
- Hover: border `--border-strong`, lift 4px, button swaps to orange.
- Skeleton: shimmering blocks for each metric.

### 7.12 Accordion (FAQ)

- Row height 48px, separated by nothing; items stack with 20px spacing. Question label style, white when open, `--text-3` when collapsed. Trailing icon: plus (collapsed) / x (open).
- Open answer: italic uppercase caption in `--text-2`, 12px below question, max-width 440px.
- Animation: height 200ms ease, icon rotates 45 degrees.
- Single-open behavior; keyboard: Enter/Space toggles, arrow keys move between questions. Use `aria-expanded` and `aria-controls`.
- Header: large pixel chat-bubble icon (orange), H2 "FAQ" overlapping bottom-left, below it "MORE QUESTIONS? SEND AN EMAIL TO" and a white underlined mail link.

### 7.13 Create-your-own CTA card

- Container width, radius 16px, padding 48px 32px, purple spotlight gradient.
- Top: open-lid 3D cube mascot, centered and overflowing the card's top edge by about 40px.
- Eyebrow, H2 "Create Your Own Mine", paragraph (max-width 400px, 12px, `--text-2`), white button, trust microcopy.
- Floating coins at the left and right edges.

### 7.14 Footer

- Top hairline. Left: logo, tagline (10px white). Right: social icons.
- Bottom row: legal entity text (`legal`, left, 9px, `--text-4`) and copyright with links (right).
- Floating back-to-top button: 32px orange rounded square with a pixel-style up arrow, bottom-right. A pixel mascot (orange smiley badge) floats above the footer.

### 7.15 Recommended additions (not in screenshot)

- **Toast:** surface-2 card, 4px left border in semantic color, auto-dismiss 4s.
- **Input / bet amount field:** surface-1, border `--border`, radius 6px, focus border `--orange-500`, mono numerals, MAX chip.
- **Result states:** win = orange confetti blocks + `--success` text; loss = `--danger` text with a shake.
- **Wallet modal:** dark card on 70% black backdrop, wallet rows with 40px logos.
- **Table (Leaderboard):** zebra rows `--surface-1`/transparent, rank in orange display type, top 3 with chamfered highlight.

## 8. Motion

- **Easing:** `--ease-out` cubic-bezier(0.22, 1, 0.36, 1); `--ease-in-out` cubic-bezier(0.65, 0, 0.35, 1).
- **Durations:** fast 120ms (hover), base 200ms (accordion, cards), slow 400ms (section reveal), ambient 6-8s (float loops).
- **Scroll reveal:** translateY(24px) + opacity 0 to 1, staggered 80ms per child.
- **Count-up** for stat numerals.
- **Float loop:** cubes and coins `translateY(0 to -10px) rotate(0 to 4deg)`, alternate infinite, delays randomized.
- **Marquee:** linear infinite.
- Respect `prefers-reduced-motion`: disable float, marquee and count-up.

## 9. Content and Voice

- Tone: confident, short, gamer-friendly. Verbs first ("Grind", "Mine", "Play", "Win").
- Headline case: UPPERCASE for section titles, Mixed Case for narrative headings.
- CTA labels: "START PLAYING NOW!", "CONNECT WALLET", "ENTER MINE", "VIEW LEADERBOARD".
- Numbers: thousands separators (87,900), currency prefix ($360K), 1 decimal on percentages (38.2%).
- Always pair gambling-style actions with a clarity line ("All interactions are safe and protected"). Consider adding a responsible-play disclaimer in the footer.

## 10. Tokens as Code

### 10.1 CSS variables

```css
:root {
  /* color */
  --bg-0: #0a0c0d;
  --bg-1: #111314;
  --surface-1: #17191a;
  --surface-2: #202223;
  --border: #232628;
  --border-strong: #34383b;
  --text-1: #ffffff;
  --text-2: #b8bcc0;
  --text-3: #7c8186;
  --text-4: #4f5459;
  --orange-300: #ff9a66;
  --orange-400: #ff7433;
  --orange-500: #ff4f00;
  --orange-600: #e04400;
  --orange-700: #a83300;
  --purple-300: #c08bff;
  --purple-400: #a25cff;
  --purple-500: #8a2bff;
  --purple-600: #7016e0;
  --purple-900: #2a0f55;
  --cream: #f1eee8;
  --success: #a3e635;
  --warning: #ffc93c;
  --danger: #ff3b3b;

  /* type */
  --font-display: var(--font-display), Impact, sans-serif;
  --font-sans: var(--font-sans), system-ui, sans-serif;

  /* radius */
  --r-xs: 4px;
  --r-sm: 6px;
  --r-md: 12px;
  --r-lg: 16px;
  --r-pill: 999px;

  /* space */
  --s-1: 4px;
  --s-2: 8px;
  --s-3: 12px;
  --s-4: 16px;
  --s-5: 20px;
  --s-6: 24px;
  --s-8: 32px;
  --s-10: 40px;
  --s-12: 48px;
  --s-16: 64px;
  --s-24: 96px;

  /* layout */
  --container: 880px;
  --gutter: 48px;
  --header-h: 72px;

  /* motion */
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --dur-fast: 120ms;
  --dur-base: 200ms;
  --dur-slow: 400ms;
}
body {
  background: var(--bg-0);
  color: var(--text-1);
  font-family: var(--font-sans);
}
```

### 10.2 Tailwind (v4) theme

```css
@theme {
  --color-bg: #0a0c0d;
  --color-surface: #17191a;
  --color-surface-2: #202223;
  --color-line: #232628;
  --color-orange: #ff4f00;
  --color-orange-hover: #ff7433;
  --color-purple: #8a2bff;
  --color-cream: #f1eee8;
  --color-muted: #7c8186;
  --font-display: var(--font-display), Impact, sans-serif;
  --font-sans: var(--font-sans), system-ui, sans-serif;
  --radius-card: 12px;
  --radius-banner: 16px;
  --container-site: 880px;
}
```

### 10.3 Component snippets

```css
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 16px;
  border-radius: var(--r-sm);
  font: 700 11px/1 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  transition:
    transform var(--dur-fast) var(--ease-out),
    background var(--dur-fast);
}
.btn:hover {
  transform: translateY(-1px);
}
.btn-purple {
  background: var(--purple-500);
  color: #fff;
}
.btn-orange {
  background: var(--orange-500);
  color: #fff;
}
.btn-cream {
  background: var(--cream);
  color: var(--bg-0);
}

.card {
  background: linear-gradient(180deg, var(--surface-2), #141617);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 16px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.stat {
  background: var(--orange-500);
  padding: 24px;
  min-height: 110px;
  clip-path: polygon(0 0, calc(100% - 28px) 0, 100% 28px, 100% 100%, 0 100%);
}

.eyebrow::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  background: var(--orange-500);
  margin-right: 8px;
}
```

## 11. Implementation Notes (Next.js + TypeScript)

- Build primitives first: `Button`, `Eyebrow`, `Card`, `StatCard`, `MineCard`, `Accordion`, `Section`, `Container`, `FloatingAsset`.
- Use CSS variables for tokens and Tailwind for composition; keep `clip-path` shapes in utility classes.
- Export cubes and coins as optimized WebP/AVIF at 2x with transparent background, or as inline SVG for the pixel icons.
- Lazy-load below-the-fold illustrations; preload the display font and the hero cube.
- Accordion: use Radix `@radix-ui/react-accordion` styled with the tokens above.
- Number formatting: `Intl.NumberFormat('en-US', { notation:'compact' })` for $360K, standard grouping for liquidity.
- Wallet connect: Solana wallet adapter UI, restyled to the cream button and dark modal.

## 12. Do and Don't

**Do**

- Keep backgrounds nearly black and let one saturated color dominate each block.
- Use big numerals with tiny uppercase labels.
- Keep pixel/chamfer motifs consistent; every colored block gets a notch or pixel bite.
- Use the cream button on dark surfaces, white on colored ones.

**Don't**

- Don't use rounded, soft or pastel styles; this brand is hard-edged and saturated.
- Don't set long paragraphs in uppercase; limit that to 2-3 lines.
- Don't add drop shadows on dark cards; use borders and gradients.
- Don't place gray text on colored backgrounds.
- Don't animate more than three ambient elements per viewport.
