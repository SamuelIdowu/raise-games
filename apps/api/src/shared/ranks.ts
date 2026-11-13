import type { RankTier } from '@raise/types';

export interface RankBand {
  min: number;
  max: number | null;
  label: string;
}

export const RANK_TIER_BANDS: Record<RankTier, RankBand> = {
  rookie: { min: 0, max: 999, label: 'Rookie' },
  challenger: { min: 1000, max: 1149, label: 'Challenger' },
  contender: { min: 1150, max: 1299, label: 'Contender' },
  elite: { min: 1300, max: 1449, label: 'Elite' },
  champion: { min: 1450, max: null, label: 'Champion' },
};

export function rankTierForRating(rating: number): RankTier {
  if (rating >= 1450) return 'champion';
  if (rating >= 1300) return 'elite';
  if (rating >= 1150) return 'contender';
  if (rating >= 1000) return 'challenger';
  return 'rookie';
}

export function rankTierLabel(tier: RankTier): string {
  switch (tier) {
    case 'champion':
      return 'Champion';
    case 'elite':
      return 'Elite';
    case 'contender':
      return 'Contender';
    case 'challenger':
      return 'Challenger';
    case 'rookie':
      return 'Rookie';
  }
}

export function rankTierRange(tier: RankTier): { min: number; max: number | null } {
  switch (tier) {
    case 'champion':
      return { min: 1450, max: null };
    case 'elite':
      return { min: 1300, max: 1449 };
    case 'contender':
      return { min: 1150, max: 1299 };
    case 'challenger':
      return { min: 1000, max: 1149 };
    case 'rookie':
      return { min: 0, max: 999 };
  }
}
