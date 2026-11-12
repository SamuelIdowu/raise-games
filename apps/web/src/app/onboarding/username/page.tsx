'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Banner } from '@/components/ui';
import { authApi } from '@raise/api-client';

export default function UsernamePage() {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cleaned = username.trim();
    if (cleaned.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(cleaned)) {
      setError('Only letters, numbers, and underscores allowed');
      return;
    }
    setSaving(true);
    try {
      await authApi.updateMe({ displayName: cleaned });
      router.push('/onboarding/games');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save username');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="font-display text-h1 font-semibold text-fg">Choose your username</h1>
        <p className="mt-2 text-body-sm text-fg-muted">This is how other players will see you</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Username"
          placeholder="e.g. ade_plays"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={error}
          helper="3–20 characters, letters, numbers, and underscores only"
          autoComplete="username"
          maxLength={20}
        />

        <Banner variant="system" className="text-sm">
          You can change this later.
        </Banner>

        <Button type="submit" fullWidth loading={saving} className="mt-2">
          Continue
        </Button>
      </form>
    </div>
  );
}
