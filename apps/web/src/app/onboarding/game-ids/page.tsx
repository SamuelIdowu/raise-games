'use client';

import { useState } from 'react';
import { Button, Input, Select, Banner } from '@/components/ui';

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

export default function GameIdsPage() {
  const [gameIds, setGameIds] = useState<Record<string, string>>({
    fifa25: '',
    cod: '',
    tekken8: '',
    streetfighter6: '',
  });
  const [state, setState] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      window.location.href = '/';
    }, 600);
  };

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="font-display text-h1 font-semibold text-fg">Add your game IDs</h1>
        <p className="mt-2 text-body-sm text-fg-muted">
          So opponents can find you in-game (optional)
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="FIFA 25 Gamertag"
          placeholder="e.g. AdePlays23"
          value={gameIds.fifa25}
          onChange={(e) => setGameIds({ ...gameIds, fifa25: e.target.value })}
        />
        <Input
          label="Call of Duty Activision ID"
          placeholder="e.g. AdePlays#1234567"
          value={gameIds.cod}
          onChange={(e) => setGameIds({ ...gameIds, cod: e.target.value })}
        />
        <Input
          label="Tekken 8 Player ID"
          placeholder="e.g. AdePlays_T8"
          value={gameIds.tekken8}
          onChange={(e) => setGameIds({ ...gameIds, tekken8: e.target.value })}
        />
        <Input
          label="Street Fighter 6 CFN ID"
          placeholder="e.g. AdePlays_SF6"
          value={gameIds.streetfighter6}
          onChange={(e) => setGameIds({ ...gameIds, streetfighter6: e.target.value })}
        />

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
