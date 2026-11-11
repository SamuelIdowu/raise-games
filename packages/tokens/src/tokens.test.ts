/**
 * Drift guard (Sprint 1 F1.1): tokens.json must match the canonical tables in
 * docs/Design System RAISE (Stage 1).md §2–§5. If the doc changes, update the
 * expected values here in the same PR (token changelog process, doc §13).
 */
import { describe, it, expect } from 'vitest';
import tokens from '../tokens.json';

const DOC = {
  dark: {
    bg0: '#0A0C10',
    bg1: '#11151B',
    bg2: '#181D25',
    bg3: '#202733',
    border: '#2A3340',
    borderStrong: '#3B4758',
    text1: '#E8EDF4',
    text2: '#A3AFBF',
    text3: '#6B7788',
    accent: '#22D3EE',
    accentHover: '#67E8F9',
    accentPress: '#06B6D4',
    accentSubtle: 'rgba(34,211,238,0.12)',
    onAccent: '#031316',
    scrim: 'rgba(0,0,0,0.6)',
  },
  light: {
    bg0: '#F6F8FA',
    bg1: '#FFFFFF',
    bg2: '#EEF2F6',
    bg3: '#E3E9F0',
    border: '#D3DAE3',
    borderStrong: '#A9B4C2',
    text1: '#0E141B',
    text2: '#4A5666',
    text3: '#7A8798',
    accent: '#0E7490',
    accentHover: '#155E75',
    accentPress: '#164E63',
    accentSubtle: 'rgba(14,116,144,0.10)',
    onAccent: '#FFFFFF',
    scrim: 'rgba(14,20,27,0.45)',
  },
  status: {
    win: { dark: '#34D399', light: '#047857' },
    loss: { dark: '#F87171', light: '#B91C1C' },
    dispute: { dark: '#FBBF24', light: '#B45309' },
  },
};

describe('tokens.json color tables match the design doc (§2)', () => {
  it('dark theme', () => {
    expect(tokens.color.dark).toEqual(DOC.dark);
  });
  it('light theme', () => {
    expect(tokens.color.light).toEqual(DOC.light);
  });
  it('status colors', () => {
    expect(tokens.color.status).toEqual(DOC.status);
  });
});

describe('tokens.json typography matches the design doc (§3)', () => {
  it('type scale', () => {
    expect(tokens.typography.scale).toEqual({
      display: { size: 32, line: 36, weight: 700, face: 'display' },
      h1: { size: 24, line: 28, weight: 600, face: 'display' },
      h2: { size: 20, line: 24, weight: 600, face: 'display' },
      h3: { size: 16, line: 20, weight: 600, face: 'display' },
      body: { size: 16, line: 24, weight: 400, face: 'body' },
      bodySm: { size: 14, line: 20, weight: 400, face: 'body' },
      caption: { size: 12, line: 16, weight: 500, face: 'body' },
      label: {
        size: 12,
        line: 16,
        weight: 600,
        face: 'display',
        transform: 'uppercase',
        tracking: '0.06em',
      },
      statLg: { size: 28, line: 32, weight: 600, face: 'display', tabular: true },
      statMd: { size: 18, line: 24, weight: 600, face: 'display', tabular: true },
    });
  });
});

describe('tokens.json spacing/layout/shape/motion match the design doc (§4–§5)', () => {
  it('spacing scale', () => {
    expect(tokens.spacing.scale).toEqual([4, 8, 12, 16, 20, 24, 32, 40, 48, 64]);
    expect(tokens.spacing.sectionGap).toBe(24);
    expect(tokens.spacing.pageMargin).toEqual({ mobile: 16, tablet: 24, desktop: 32 });
  });
  it('layout', () => {
    expect(tokens.layout.breakpoints).toEqual({ base: 360, sm: 640, md: 768, lg: 1024, xl: 1280 });
    expect(tokens.layout.maxContentWidth).toBe(1200);
    expect(tokens.layout.sidebarWidth).toBe(240);
    expect(tokens.layout.sidebarIcon).toBe(72);
    expect(tokens.layout.bottomNavHeight).toBe(56);
    expect(tokens.layout.touchTargetMin).toBe(44);
  });
  it('radius scale is 0/2/4/6', () => {
    expect(tokens.radius).toEqual({ table: 0, control: 2, card: 4, modal: 6 });
  });
  it('motion durations and easing', () => {
    expect(tokens.motion.durationMs).toMatchObject({ micro: 100, default: 160, sheet: 240 });
    expect(tokens.motion.easing).toBe('cubic-bezier(0.2, 0, 0, 1)');
  });
});
