import tokensJson from '../tokens.json';

export const tokens = tokensJson;
export type Tokens = typeof tokens;

export type ThemeName = 'dark' | 'light';
export type ThemeColors = (typeof tokens)['color']['dark'];
export type StatusColors = (typeof tokens)['color']['status'];

export const statusColors = tokens.color.status;
export const breakpoints = tokens.layout.breakpoints;
export const motion = tokens.motion;
export const radius = tokens.radius;
export const spacing = tokens.spacing;
export const typography = tokens.typography;
export const marketingTypography = tokens.typography.marketingScale;
export const layout = tokens.layout;
export const border = tokens.border;
export const shape = tokens.shape;
export const elevation = tokens.elevation;
export const zIndex = tokens.zIndex;
