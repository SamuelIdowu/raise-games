/* eslint-disable */
/**
 * Emit CSS variables and a typed theme object from tokens.json.
 * Writes to dist/tokens.css (packaged), apps/web/src/app/tokens.css (web import)
 * and apps/web/src/lib/tokens.generated.ts (runtime theme values).
 * Also covered by a drift guard in src/tokens.test.ts.
 *
 * Run automatically as part of `pnpm build` for @raise/tokens.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const repoRoot = resolve(packageRoot, '../..');
const tokens = JSON.parse(readFileSync(resolve(packageRoot, 'tokens.json'), 'utf-8'));

/** bg0 -> bg-0, borderStrong -> border-strong, accentHover -> accent-hover */
const cssVarName = (key) =>
  `--${key
    .replace(/(\d+)/g, '-$1')
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()}`;

/** displayXl -> display-xl, h2Mixed -> h2-mixed (digits stay attached) */
const typeName = (key) => key.replace(/([A-Z])/g, '-$1').toLowerCase();

const px = (value) => (typeof value === 'number' ? `${value}px` : value);

const line = (value) =>
  typeof value === 'number' ? (value <= 4 ? String(value) : `${value}px`) : value;

const colorLines = (theme) =>
  Object.entries(tokens.color[theme])
    .map(([key, value]) => `  ${cssVarName(key)}: ${value};`)
    .join('\n');

const statusLines = (theme) =>
  Object.entries(tokens.color.status)
    .map(([key, pair]) => `  --${key}: ${pair[theme]};`)
    .join('\n');

const elevationLines = (theme) =>
  [
    `  --elevation-card: ${tokens.elevation.card[theme]};`,
    `  --elevation-hard: ${tokens.elevation.hard[theme]};`,
    `  --elevation-toast: ${tokens.elevation.toast[theme]};`,
  ].join('\n');

// shadcn/ui variable mapping. Surfaces follow the Blocks elevation ladder:
// surface = bg-2 (cards), raised = bg-3 (inputs, popovers), overlay = --overlay (hover).
const SHADCN = [
  ['--background', 'var(--bg-0)'],
  ['--foreground', 'var(--text-1)'],
  ['--card', 'var(--bg-2)'],
  ['--popover', 'var(--bg-3)'],
  ['--primary', 'var(--accent)'],
  ['--primary-foreground', 'var(--on-accent)'],
  ['--secondary', 'var(--bg-3)'],
  ['--secondary-foreground', 'var(--text-1)'],
  ['--muted', 'var(--bg-3)'],
  ['--muted-foreground', 'var(--text-2)'],
  ['--accent-foreground', 'var(--on-accent)'],
  ['--destructive', 'var(--loss)'],
  ['--destructive-foreground', 'var(--on-accent)'],
  ['--border', 'var(--border)'],
  ['--input', 'var(--control-border)'],
  ['--ring', 'var(--accent)'],
];
const shadcnBlock = SHADCN.map(([name, value]) => `  ${name}: ${value};`).join('\n');

const themeBlock = (theme, selector) =>
  `${selector} {\n${colorLines(theme)}\n${statusLines(theme)}\n${elevationLines(theme)}\n${shadcnBlock}\n}`;

const typeLines = (prefix, scale) =>
  Object.entries(scale)
    .flatMap(([key, value]) => {
      const name = `--type-${prefix}${typeName(key)}`;
      const lines = [`  ${name}-size: ${px(value.size)};`, `  ${name}-line: ${line(value.line)};`];
      if (value.weight) lines.push(`  ${name}-weight: ${value.weight};`);
      if (value.tracking) lines.push(`  ${name}-tracking: ${value.tracking};`);
      if (value.transform) lines.push(`  ${name}-transform: ${value.transform};`);
      return lines;
    })
    .join('\n');

const spacingLines = tokens.spacing.scale
  .map((value) => `  --space-${value}: ${value}px;`)
  .join('\n');

const layoutLines = [
  ...Object.entries(tokens.layout.breakpoints).map(
    ([key, value]) => `  --layout-breakpoint-${key}: ${px(value)};`,
  ),
  `  --layout-max-content: ${px(tokens.layout.maxContentWidth)};`,
  `  --layout-marketing: ${px(tokens.layout.marketingWidth)};`,
  `  --layout-reading: ${px(tokens.layout.readingColumn)};`,
  `  --layout-header-mobile: ${px(tokens.layout.headerHeight.mobile)};`,
  `  --layout-header-desktop: ${px(tokens.layout.headerHeight.desktop)};`,
  `  --layout-sidebar: ${px(tokens.layout.sidebarWidth)};`,
  `  --layout-sidebar-icon: ${px(tokens.layout.sidebarIcon)};`,
  `  --layout-bottom-nav: ${px(tokens.layout.bottomNavHeight)};`,
  `  --layout-touch-target: ${px(tokens.layout.touchTargetMin)};`,
  `  --layout-grid-mobile: ${tokens.layout.gridColumns.mobile};`,
  `  --layout-grid-tablet: ${tokens.layout.gridColumns.tablet};`,
  `  --layout-grid-desktop: ${tokens.layout.gridColumns.desktop};`,
].join('\n');

// Prefix avoids colliding with Tailwind's own --radius-* theme namespace.
const radiusLines = Object.entries(tokens.radius)
  .map(([key, value]) => `  --radius-token-${key}: ${px(value)};`)
  .join('\n');

const borderLines = Object.entries(tokens.border)
  .map(([key, value]) => `  --border-${key}: ${px(value)};`)
  .join('\n');

const shapeLines = [
  ...Object.entries(tokens.shape.chamfer).map(
    ([key, value]) => `  --chamfer-${key}: ${px(value)};`,
  ),
  `  --pixel-bite: ${px(tokens.shape.pixelBite)};`,
].join('\n');

const motion = tokens.motion;
const motionLines = [
  `  --motion-micro: ${motion.durationMs.micro}ms;`,
  `  --motion-default: ${motion.durationMs.default}ms;`,
  `  --motion-slow: ${motion.durationMs.slow}ms;`,
  `  --motion-sheet: ${motion.durationMs.sheet}ms;`,
  `  --motion-ambient: ${motion.durationMs.ambient}ms;`,
  `  --motion-count-up-min: ${motion.durationMs.countUp[0]}ms;`,
  `  --motion-count-up-max: ${motion.durationMs.countUp[1]}ms;`,
  `  --motion-ease-standard: ${motion.easing};`,
  `  --motion-ease-enter: ${motion.easingEnter};`,
  `  --motion-ease-exit: ${motion.easingExit};`,
].join('\n');

const zLines = Object.entries(tokens.zIndex)
  .map(([key, value]) => `  --z-${key}: ${value};`)
  .join('\n');

const css = [
  '/* AUTOGENERATED from packages/tokens/tokens.json - do not edit by hand. */',
  '/* Source of truth: docs/Blocks.fun Design System.md */',
  '/* Regenerate: pnpm --filter @raise/tokens build */',
  themeBlock('dark', ":root,\n[data-theme='dark']"),
  themeBlock('light', "[data-theme='light']"),
  [
    ':root {',
    `  --font-stack-display: ${tokens.typography.fontDisplay};`,
    `  --font-stack-body: ${tokens.typography.fontBody};`,
    `  --font-stack-mono: ${tokens.typography.fontMono};`,
    typeLines('', tokens.typography.scale),
    typeLines('mk-', tokens.typography.marketingScale),
    spacingLines,
    layoutLines,
    radiusLines,
    borderLines,
    shapeLines,
    `  --elevation-glow: ${tokens.elevation.glow};`,
    motionLines,
    zLines,
    '}',
  ].join('\n'),
].join('\n\n');

const cssOutPaths = [
  resolve(packageRoot, 'dist/tokens.css'),
  resolve(repoRoot, 'apps/web/src/app/tokens.css'),
];

for (const outPath of cssOutPaths) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${css}\n`, 'utf-8');
  console.log(`Wrote ${outPath}`);
}

const ts = `/* AUTOGENERATED from packages/tokens/tokens.json - do not edit by hand. */
// Regenerate: pnpm --filter @raise/tokens emit:css
export const theme = {
  dark: ${JSON.stringify(tokens.color.dark, null, 2)},
  light: ${JSON.stringify(tokens.color.light, null, 2)},
} as const;

export const status = ${JSON.stringify(tokens.color.status, null, 2)} as const;

export const layout = ${JSON.stringify(tokens.layout, null, 2)} as const;
`;

const tsOutPath = resolve(repoRoot, 'apps/web/src/lib/tokens.generated.ts');
mkdirSync(dirname(tsOutPath), { recursive: true });
writeFileSync(tsOutPath, ts, 'utf-8');
console.log(`Wrote ${tsOutPath}`);
