/**
 * Drift guard: tokens.json must match the canonical tables in
 * docs/Blocks.fun Design System.md. If the design reference changes, update the
 * expected values here in the same PR. The legacy RAISE Stage 1 cyan system is
 * intentionally absent.
 */
import { describe, it, expect } from 'vitest';
import tokens from '../tokens.json';

const DOC = {
  dark: {
    bg0: '#0A0C0D',
    bg1: '#111314',
    bg2: '#17191A',
    bg3: '#202223',
    overlay: '#26292B',
    border: '#232628',
    borderStrong: '#34383B',
    controlBorder: '#5E6469',
    text1: '#FFFFFF',
    text2: '#B8BCC0',
    text3: '#7C8186',
    fgDisabled: '#4F5459',
    accent: '#8A2BFF',
    accentHover: '#A25CFF',
    accentPress: '#7016E0',
    accentSubtle: 'rgba(138,43,255,0.16)',
    onAccent: '#FFFFFF',
    brand: '#FF4F00',
    brandHover: '#FF7433',
    brandPress: '#E04400',
    brandSubtle: 'rgba(255,79,0,0.12)',
    onBrand: '#0A0C0D',
    orange300: '#FF9A66',
    orange400: '#FF7433',
    orange500: '#FF4F00',
    orange600: '#E04400',
    orange700: '#A83300',
    purple300: '#C08BFF',
    purple400: '#A25CFF',
    purple500: '#8A2BFF',
    purple600: '#7016E0',
    purple900: '#2A0F55',
    cream: '#F1EEE8',
    onCream: '#0A0C0D',
    onOrange: '#0A0C0D',
    scrim: 'rgba(0,0,0,0.64)',
    purple700: '#4E14A3',
    shadowInk: '#000000',
    accentInk: '#3D0F80',
    brandInk: '#A83300',
    creamInk: '#8C887F',
  },
  light: {
    bg0: '#F5F1E8',
    bg1: '#EDE8DD',
    bg2: '#FFFFFF',
    bg3: '#F8F5EF',
    overlay: '#E7E1D5',
    border: '#D6CFC2',
    borderStrong: '#B4AB9B',
    controlBorder: '#8F8575',
    text1: '#0A0C0D',
    text2: '#3A3F43',
    text3: '#62686D',
    fgDisabled: '#8E9499',
    accent: '#7016E0',
    accentHover: '#5C10BC',
    accentPress: '#480B96',
    accentSubtle: 'rgba(112,22,224,0.10)',
    onAccent: '#FFFFFF',
    brand: '#A83300',
    brandHover: '#8F2A00',
    brandPress: '#752200',
    brandSubtle: 'rgba(168,51,0,0.10)',
    onBrand: '#FFFFFF',
    orange300: '#FF9A66',
    orange400: '#FF7433',
    orange500: '#FF4F00',
    orange600: '#E04400',
    orange700: '#A83300',
    purple300: '#C08BFF',
    purple400: '#A25CFF',
    purple500: '#8A2BFF',
    purple600: '#7016E0',
    purple900: '#2A0F55',
    cream: '#F1EEE8',
    onCream: '#0A0C0D',
    onOrange: '#0A0C0D',
    scrim: 'rgba(10,12,13,0.48)',
    purple700: '#4E14A3',
    shadowInk: '#0A0C0D',
    accentInk: '#0A0C0D',
    brandInk: '#0A0C0D',
    creamInk: '#0A0C0D',
  },
  status: {
    win: { dark: '#A3E635', light: '#4D7C0F' },
    loss: { dark: '#FF3B3B', light: '#B91C1C' },
    dispute: { dark: '#FFC93C', light: '#92400E' },
  },
};

describe('tokens.json color tables match the Blocks design reference', () => {
  it('dark theme', () => {
    expect(tokens.color.dark).toEqual(DOC.dark);
  });
  it('light theme', () => {
    expect(tokens.color.light).toEqual(DOC.light);
  });
  it('status colors', () => {
    expect(tokens.color.status).toEqual(DOC.status);
  });
  it('does not contain the legacy cyan accent', () => {
    expect(JSON.stringify(tokens)).not.toMatch(/#22D3EE|#67E8F9|#06B6D4/i);
  });
  it('uses accessible light-theme accent and control borders', () => {
    expect(tokens.color.light.accent).toBe('#7016E0');
    expect(tokens.color.light.onAccent).toBe('#FFFFFF');
    expect(tokens.color.dark.controlBorder).toBe('#5E6469');
    expect(tokens.color.light.controlBorder).toBe('#8F8575');
  });
});

describe('tokens.json typography matches the Blocks type system', () => {
  it('font families', () => {
    expect(tokens.typography.fontDisplay).toContain('Unbounded');
    expect(tokens.typography.fontBody).toContain('Space Grotesk');
    expect(tokens.typography.fontMono).toContain('ui-monospace');
  });
  it('app type scale stays readable', () => {
    expect(tokens.typography.scale).toEqual({
      display: {
        size: 32,
        line: 34,
        weight: 900,
        face: 'display',
        tracking: '-0.02em',
      },
      h1: {
        size: 26,
        line: 30,
        weight: 800,
        face: 'display',
        tracking: '-0.01em',
      },
      h2: {
        size: 20,
        line: 24,
        weight: 800,
        face: 'display',
      },
      h3: {
        size: 16,
        line: 20,
        weight: 700,
        face: 'display',
      },
      body: {
        size: 14,
        line: 21,
        weight: 500,
        face: 'body',
      },
      bodySm: {
        size: 13,
        line: 19,
        weight: 500,
        face: 'body',
      },
      caption: {
        size: 12,
        line: 17,
        weight: 500,
        face: 'body',
      },
      label: {
        size: 10,
        line: 10,
        weight: 600,
        face: 'display',
        transform: 'uppercase',
        tracking: '0.1em',
      },
      statLg: {
        size: 32,
        line: 32,
        weight: 900,
        face: 'display',
        tabular: true,
        tracking: '-0.02em',
      },
      statMd: {
        size: 20,
        line: 22,
        weight: 800,
        face: 'display',
        tabular: true,
      },
    });
  });
  it('marketing display scale', () => {
    expect(tokens.typography.marketingScale.displayXl).toEqual({
      size: 'clamp(2.75rem, 6vw, 5rem)',
      line: 0.9,
      weight: 900,
      face: 'display',
      transform: 'uppercase',
      tracking: '-0.02em',
    });
    expect(tokens.typography.marketingScale.h2).toMatchObject({
      size: 'clamp(1.5rem, 2.8vw, 2rem)',
      weight: 900,
      transform: 'uppercase',
    });
    expect(tokens.typography.marketingScale.legal.size).toBe(10);
  });
});

describe('tokens.json spacing/layout/shape/motion match the Blocks system', () => {
  it('spacing scale', () => {
    expect(tokens.spacing.scale).toEqual([4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96, 128]);
    expect(tokens.spacing.sectionGap).toBe(64);
    expect(tokens.spacing.section).toEqual({ sm: 64, md: 96, lg: 128 });
    expect(tokens.spacing.pageMargin).toEqual({ mobile: 16, tablet: 24, desktop: 48 });
  });
  it('layout', () => {
    expect(tokens.layout.breakpoints).toEqual({
      base: 320,
      sm: 640,
      md: 768,
      lg: 1024,
      xl: 1280,
    });
    expect(tokens.layout.maxContentWidth).toBe(1200);
    expect(tokens.layout.marketingWidth).toBe(880);
    expect(tokens.layout.headerHeight).toEqual({ mobile: 56, desktop: 72 });
    expect(tokens.layout.sidebarWidth).toBe(240);
    expect(tokens.layout.sidebarIcon).toBe(72);
    expect(tokens.layout.bottomNavHeight).toBe(56);
    expect(tokens.layout.touchTargetMin).toBe(44);
  });
  it('radius, border and shape', () => {
    expect(tokens.radius).toEqual({
      table: 0,
      xs: 4,
      sm: 6,
      md: 12,
      lg: 16,
      control: 6,
      card: 12,
      modal: 16,
      pill: 999,
    });
    expect(tokens.border).toEqual({
      hairline: 1,
      selected: 2,
      focus: 2,
      focusOffset: 2,
      control: 1,
    });
    expect(tokens.shape).toEqual({
      chamfer: { sm: 10, md: 16, lg: 28 },
      pixelBite: 8,
    });
  });
  it('elevation and motion', () => {
    expect(tokens.elevation.card.dark).toContain('inset');
    expect(tokens.elevation.hard.light).toContain('4px 4px 0');
    expect(tokens.elevation.glow).toContain('#8A2BFF');
    expect(tokens.motion.durationMs).toEqual({
      micro: 120,
      default: 200,
      slow: 400,
      sheet: 240,
      ambient: 7000,
      countUp: [600, 900],
    });
    expect(tokens.motion.easing).toBe('cubic-bezier(0.22, 1, 0.36, 1)');
    expect(tokens.zIndex).toEqual({ base: 0, sticky: 30, nav: 40, sheet: 50, toast: 60 });
  });
});
