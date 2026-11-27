'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Banner } from '@/components/ui';
import { ApiError, authApi } from '@raise/api-client';
import { USERNAME_MAX, usernameError } from '@raise/schemas';

type Check =
  | { state: 'idle' }
  | { state: 'checking'; name: string }
  | { state: 'available'; name: string }
  | { state: 'unavailable'; name: string; reason: string }
  | { state: 'failed'; name: string };

const HELPER = '3–20 characters: letters, numbers and single underscores';

export default function UsernamePage() {
  const [username, setUsername] = useState('');
  const [touched, setTouched] = useState(false);
  const [check, setCheck] = useState<Check>({ state: 'idle' });
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const cleaned = username.trim();
  const formatError = cleaned ? usernameError(cleaned) : null;

  // Ask the server once typing pauses and the format is fine. Older answers are dropped.
  useEffect(() => {
    if (!cleaned || formatError) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setCheck({ state: 'checking', name: cleaned });
      authApi
        .usernameAvailable(cleaned, { signal: controller.signal })
        .then((res) =>
          setCheck(
            res.available
              ? { state: 'available', name: cleaned }
              : { state: 'unavailable', name: cleaned, reason: res.reason ?? 'Not available' },
          ),
        )
        .catch(() => {
          if (!controller.signal.aborted) setCheck({ state: 'failed', name: cleaned });
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [cleaned, formatError]);

  // Only trust a result for the name currently in the box.
  const current = check.state !== 'idle' && check.name === cleaned ? check : null;

  // Format problems show once the player has typed a few characters or left the field.
  const showFormat = !!formatError && (touched || cleaned.length >= 3);
  const error =
    submitError ||
    (showFormat ? formatError : null) ||
    (current?.state === 'unavailable' ? current.reason : null) ||
    undefined;
  const success = !error && current?.state === 'available' ? `${cleaned} is available` : undefined;
  const pending =
    !error && !formatError && cleaned && (!current || current.state === 'checking')
      ? 'Checking availability…'
      : undefined;
  const helper =
    current?.state === 'failed' ? 'Couldn’t check right now. You can still continue.' : HELPER;

  const canSubmit =
    !!cleaned && !formatError && (current?.state === 'available' || current?.state === 'failed');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setSubmitError('');
    if (!canSubmit) return;
    setSaving(true);
    try {
      await authApi.updateMe({ displayName: cleaned });
      router.push('/onboarding/games');
    } catch (err) {
      if (err instanceof ApiError && err.reason === 'username_taken') {
        setCheck({ state: 'unavailable', name: cleaned, reason: err.message });
      } else {
        setSubmitError(err instanceof Error ? err.message : 'Failed to save username');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="font-display text-mk-h1 uppercase text-fg text-balance">
          Choose your username
        </h1>
        <p className="mt-2 text-body-sm text-fg-muted">This is how other players will see you</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Input
          label="Username"
          placeholder="e.g. ade_plays"
          value={username}
          onChange={(e) => {
            // Spaces are never allowed; dropping them as typed saves a round of errors.
            setUsername(e.target.value.replace(/\s/g, ''));
            setSubmitError('');
          }}
          onBlur={() => setTouched(true)}
          error={error}
          success={success}
          pending={pending}
          helper={helper}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={USERNAME_MAX}
          autoFocus
        />

        <Banner variant="system" className="text-sm">
          You can change this later.
        </Banner>

        <Button type="submit" fullWidth loading={saving} disabled={!canSubmit} className="mt-2">
          Continue
        </Button>
      </form>
    </div>
  );
}
