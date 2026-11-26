/**
 * Drift guard: tokens.json must match these tables. Shapes, type and motion follow
 * docs/Blocks.fun Design System.md; colours are the RAISE cyber-neon palette (purple
 * primary, neon cyan secondary, magenta highlight, cool blue-black surfaces), which
 * replaced the Blocks orange and cream. Change both in the same PR. The legacy RAISE Stage 1 cyan system is
 * intentionally absent.
 */
import { describe, it, expect } from 'vitest';
import tokens from '../tokens.json';

const DOC = {
  dark: {
    bg0: '#07080F',
    bg1: '#0C0E1A',
    bg2: '#121527',
    bg3: '#191D33',
    overlay: '#20253F',
    border: '#1E2238',
    borderStrong: '#2E3454',
    controlBorder: '#5F6890',
    text1: '#FFFFFF',
    text2: '#B6BEDA',
    text3: '#7A84A6',
    fgDisabled: '#4A5270',
    accent: '#8A2BFF',
    accentHover: '#A25CFF',
    accentPress: '#7016E0',
    accentSubtle: 'rgba(138,43,255,0.18)',
    onAccent: '#FFFFFF',
    brand: '#00E5FF',
    brandHover: '#5CF0FF',
    brandPress: '#00B8D4',
    brandSubtle: 'rgba(0,229,255,0.12)',
    onBrand: '#07080F',
    cyan300: '#7DF3FF',
    cyan400: '#33EBFF',
    cyan500: '#00E5FF',
    cyan600: '#00B8D4',
    cyan700: '#00788A',
    magenta300: '#FF8AEB',
    magenta500: '#FF2BD6',
    magenta700: '#A3008A',
    purple300: '#C08BFF',
    purple400: '#A25CFF',
    purple500: '#8A2BFF',
    purple600: '#7016E0',
    purple900: '#2A0F55',
    cream: '#E9F6FF',
    onCream: '#07080F',
    onCyan: '#07080F',
    scrim: 'rgba(3,4,10,0.72)',
    purple700: '#4E14A3',
    shadowInk: '#000000',
    accentInk: '#3D0F80',
    brandInk: '#00788A',
    creamInk: '#5B6E8C',
  },
  light: {
    bg0: '#F2F4FA',
    bg1: '#E8EBF5',
    bg2: '#FFFFFF',
    bg3: '#F7F8FC',
    overlay: '#DFE3F0',
    border: '#D3D8E8',
    borderStrong: '#A9B1CC',
    controlBorder: '#7F88A8',
    text1: '#0A0C16',
    text2: '#343A52',
    text3: '#5C6480',
    fgDisabled: '#8E95AE',
    accent: '#7016E0',
    accentHover: '#5C10BC',
    accentPress: '#480B96',
    accentSubtle: 'rgba(112,22,224,0.10)',
    onAccent: '#FFFFFF',
    brand: '#007A8C',
    brandHover: '#00687A',
    brandPress: '#005766',
    brandSubtle: 'rgba(0,122,140,0.10)',
    onBrand: '#FFFFFF',
    cyan300: '#7DF3FF',
    cyan400: '#33EBFF',
    cyan500: '#00E5FF',
    cyan600: '#00B8D4',
    cyan700: '#00788A',
    magenta300: '#FF8AEB',
    magenta500: '#FF2BD6',
    magenta700: '#A3008A',
    purple300: '#C08BFF',
    purple400: '#A25CFF',
    purple500: '#8A2BFF',
    purple600: '#7016E0',
    purple900: '#2A0F55',
    cream: '#E9F6FF',
    onCream: '#0A0C16',
    onCyan: '#07080F',
    scrim: 'rgba(10,12,22,0.48)',
    purple700: '#4E14A3',
    shadowInk: '#0A0C16',
    accentInk: '#0A0C16',
    brandInk: '#0A0C16',
    creamInk: '#0A0C16',
  },
  status: {
    win: { dark: '#B6FF3B', light: '#3F7A0A' },
    loss: { dark: '#FF2E63', light: '#C2183F' },
    dispute: { dark: '#FFE53B', light: '#8A6A00' },
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
    expect(tokens.color.dark.controlBorder).toBe('#5F6890');
    expect(tokens.color.light.controlBorder).toBe('#7F88A8');
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
