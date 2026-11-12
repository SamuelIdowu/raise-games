'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Select, Banner } from '@/components/ui';
import { gamesApi, profilesApi, authApi } from '@raise/api-client';

const STATES = [
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
  'FCT Abuja',
] as const;

interface IdField {
  key: string;
  label: string;
  type: 'text' | 'number';
  required: boolean;
}

interface GameConfig {
  key: string;
  name: string;
  idFields: IdField[];
}

function getInitialSelectedGames(): string[] {
  if (typeof window === 'undefined') return [];
  const stored = sessionStorage.getItem('onboarding_selected_games');
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export default function GameIdsPage() {
  const [selectedGames] = useState<string[]>(getInitialSelectedGames);
  const [gameConfigs, setGameConfigs] = useState<Record<string, GameConfig>>({});
  const [gameIds, setGameIds] = useState<Record<string, Record<string, string>>>({});
  const [state, setState] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    if (selectedGames.length === 0) {
      router.push('/onboarding/games');
      return;
    }
    const fetchConfigs = async () => {
      try {
        const configs: Record<string, GameConfig> = {};
        const ids: Record<string, Record<string, string>> = {};
        for (const key of selectedGames) {
          const game = await gamesApi.get(key);
          configs[key] = { key: game.key, name: game.name, idFields: game.idFields as IdField[] };
          ids[key] = {};
          for (const field of game.idFields) {
            ids[key][field.key] = '';
          }
        }
        setGameConfigs(configs);
        setGameIds(ids);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load game configs');
      } finally {
        setLoading(false);
      }
    };
    fetchConfigs();
  }, [selectedGames, router]);

  const handleGameIdChange = (gameKey: string, fieldKey: string, value: string) => {
    setGameIds((prev) => ({
      ...prev,
      [gameKey]: { ...prev[gameKey], [fieldKey]: value },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      // Update jurisdiction state
      if (state) {
        await authApi.updateMe({ jurisdictionState: state });
      }

      // Create profiles for each selected game
      for (const gameKey of selectedGames) {
        const fields = gameIds[gameKey];
        // Find the primary id field (first required)
        const config = gameConfigs[gameKey];
        const primaryField = config.idFields.find((f) => f.required);
        const inGameId = primaryField ? fields[primaryField.key] : Object.values(fields)[0] || '';
        if (!inGameId) continue; // skip if no ID provided

        await profilesApi.upsert({ gameKey, inGameId });
      }

      // Clean up sessionStorage
      sessionStorage.removeItem('onboarding_selected_games');
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete setup');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-md px-4 py-8">
        <div className="text-center">
          <p className="text-body-sm text-fg-muted">Loading game configurations…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="font-display text-h1 font-semibold text-fg">Add your game IDs</h1>
        <p className="mt-2 text-body-sm text-fg-muted">
          So opponents can find you in-game (optional)
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {selectedGames.map((gameKey) => {
          const config = gameConfigs[gameKey];
          if (!config) return null;
          return (
            <div key={gameKey} className="space-y-3">
              <h3 className="font-display text-body-sm font-semibold text-fg">{config.name}</h3>
              {config.idFields.map((field) => (
                <Input
                  key={field.key}
                  label={field.label}
                  placeholder={`e.g. ${field.label}`}
                  value={gameIds[gameKey]?.[field.key] || ''}
                  onChange={(e) => handleGameIdChange(gameKey, field.key, e.target.value)}
                  type={field.type === 'number' ? 'number' : 'text'}
                  required={field.required}
                />
              ))}
            </div>
          );
        })}

        <div className="pt-4 border-t border-line">
          <h3 className="font-display text-body-sm font-semibold text-fg mb-3">
            State of residence
          </h3>
          <p className="text-caption text-fg-muted mb-3">
            Used for jurisdiction flags to enable real-money features where available.
          </p>
          <Select
            label="State"
            placeholder="Select your state"
            value={state}
            onChange={setState}
            options={STATES.map((s) => ({ value: s, label: s }))}
          />
        </div>

        {error && (
          <Banner variant="system" className="text-sm">
            {error}
          </Banner>
        )}

        <Banner variant="system" className="text-sm">
          You can update these later in your profile.
        </Banner>

        <Button type="submit" fullWidth loading={saving} className="mt-2">
          Finish setup
        </Button>
      </form>
    </div>
  );
}
