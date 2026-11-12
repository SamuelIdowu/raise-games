'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, StatusChip, Banner } from '@/components/ui';
import { gamesApi } from '@raise/api-client';

export default function GamesPage() {
  const [games, setGames] = useState<Array<{ key: string; name: string }>>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    const fetchGames = async () => {
      try {
        const data = await gamesApi.list();
        setGames(data.map((g) => ({ key: g.key, name: g.name })));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load games');
      } finally {
        setLoading(false);
      }
    };
    fetchGames();
  }, []);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleContinue = () => {
    if (selected.size === 0) return;
    sessionStorage.setItem('onboarding_selected_games', JSON.stringify(Array.from(selected)));
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      router.push('/onboarding/game-ids');
    }, 300);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-md px-4 py-8">
        <div className="text-center">
          <p className="text-body-sm text-fg-muted">Loading games…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="font-display text-h1 font-semibold text-fg">What do you play?</h1>
        <p className="mt-2 text-body-sm text-fg-muted">Select at least one game to find matches</p>
      </div>

      <div className="space-y-3 mb-6">
        {games.map((game) => {
          const isSelected = selected.has(game.key);
          // Use first letter as monogram
          const monogram = game.name.charAt(0).toUpperCase();
          return (
            <button
              key={game.key}
              type="button"
              onClick={() => toggle(game.key)}
              className={`w-full flex items-center gap-3 rounded-card border p-3 text-left transition-colors ${
                isSelected
                  ? 'border-accent bg-accent-subtle text-fg'
                  : 'border-line bg-surface text-fg hover:border-line-strong'
              }`}
            >
              <span className="text-3xl font-display font-semibold text-fg">{monogram}</span>
              <div className="flex-1">
                <p className="font-display text-body font-semibold">{game.name}</p>
                <p className="text-caption text-fg-muted">Competitive 1v1 matches</p>
              </div>
              {isSelected && <StatusChip label="Selected" variant="accent" />}
            </button>
          );
        })}
      </div>

      {error && (
        <Banner variant="system" className="text-sm">
          {error}
        </Banner>
      )}

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
