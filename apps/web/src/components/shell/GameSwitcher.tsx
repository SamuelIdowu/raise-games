'use client';

import { useState } from 'react';
import { Button, Icon, Sheet, type SheetProps } from '@/components/ui';

const GAMES = [
  { id: 'fifa25', label: 'FIFA 25', icon: 'gamepad-2' },
  { id: 'cod', label: 'Call of Duty', icon: 'gamepad-2' },
  { id: 'tekken8', label: 'Tekken 8', icon: 'gamepad-2' },
  { id: 'streetfighter6', label: 'Street Fighter 6', icon: 'gamepad-2' },
] as const;

interface GameSwitcherProps extends Pick<SheetProps, 'size'> {
  currentGame: string;
  onChange: (gameId: string) => void;
}

export function GameSwitcher({ currentGame, onChange, size = 'sm' }: GameSwitcherProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onClose={() => setOpen(false)} title="Switch game" size={size}>
      <ul className="flex flex-col gap-1" role="listbox" aria-label="Select game">
        {GAMES.map((game) => (
          <li key={game.id}>
            <button
              role="option"
              aria-selected={game.id === currentGame}
              onClick={() => {
                onChange(game.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-3 px-3 py-2 rounded-card text-fg hover:bg-overlay ${
                game.id === currentGame ? 'bg-accent-subtle text-accent' : ''
              }`}
            >
              <Icon name={game.icon} size={24} />
              <span className="font-display text-body-sm">{game.label}</span>
              {game.id === currentGame && (
                <Icon name="check" size={20} className="ml-auto text-accent" />
              )}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

export function GameSwitcherTrigger({ currentGame }: { currentGame: string }) {
  const current = GAMES.find((g) => g.id === currentGame) ?? GAMES[0];
  return (
    <Button variant="ghost" size="sm" aria-haspopup="listbox" aria-expanded="false">
      <Icon name="gamepad-2" size={20} />
      <span className="hidden sm:inline font-display text-body-sm">{current.label}</span>
      <Icon name="chevron-down" size={16} />
    </Button>
  );
}
