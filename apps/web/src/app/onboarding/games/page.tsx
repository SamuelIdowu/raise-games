'use client';

import { useState } from 'react';
import { Button, Avatar, StatusChip, Banner } from '@/components/ui';

const GAMES = [
  { id: 'fifa25', label: 'FIFA 25', icon: '⚽' },
  { id: 'cod', label: 'Call of Duty', icon: '🎮' },
  { id: 'tekken8', label: 'Tekken 8', icon: '🥋' },
  { id: 'streetfighter6', label: 'Street Fighter 6', icon: '🥊' },
] as const;

export default function GamesPage() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleContinue = () => {
    if (selected.size === 0) return;
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      window.location.href = '/onboarding/game-ids';
    }, 600);
  };

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="font-display text-h1 font-semibold text-fg">What do you play?</h1>
        <p className="mt-2 text-body-sm text-fg-muted">Select at least one game to find matches</p>
      </div>

      <div className="space-y-3 mb-6">
        {GAMES.map((game) => {
          const isSelected = selected.has(game.id);
          return (
            <button
              key={game.id}
              type="button"
              onClick={() => toggle(game.id)}
              className={`w-full flex items-center gap-3 rounded-card border p-3 text-left transition-colors ${
                isSelected
                  ? 'border-accent bg-accent-subtle text-fg'
                  : 'border-line bg-surface text-fg hover:border-line-strong'
              }`}
            >
              <span className="text-3xl">{game.icon}</span>
              <div className="flex-1">
                <p className="font-display text-body font-semibold">{game.label}</p>
                <p className="text-caption text-fg-muted">Competitive 1v1 matches</p>
              </div>
              {isSelected && <StatusChip label="Selected" variant="accent" />}
            </button>
          );
        })}
      </div>

      <Banner variant="system" className="text-sm">
        You can add more games later from your profile.
      </Banner>

      <Button
        fullWidth
        loading={saving}
        onClick={handleContinue}
        disabled={selected.size === 0}
        className="mt-4"
      >
        Continue
      </Button>
    </div>
  );
}
