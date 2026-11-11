'use client';

import { useState } from 'react';
import { Button, Input, Banner } from '@/components/ui';

export default function UsernamePage() {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
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
    setTimeout(() => {
      setSaving(false);
      window.location.href = '/onboarding/games';
    }, 600);
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
          Your username is public and can&apos;t be changed later.
        </Banner>

        <Button type="submit" fullWidth loading={saving} className="mt-2">
          Continue
        </Button>
      </form>
    </div>
  );
}
