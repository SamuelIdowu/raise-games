'use client';

import { useState } from 'react';
import { useGame } from './GameProvider';
import { Button, Icon, Sheet, type SheetProps } from '@/components/ui';

interface GameSwitcherProps extends Pick<SheetProps, 'size'> {
  // Props kept for backward compatibility; values come from GameProvider
  currentGame?: never;
  onChange?: never;
}

export function GameSwitcher({ size = 'sm' }: GameSwitcherProps) {
  const { currentGame, setCurrentGame, games } = useGame();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onClose={() => setOpen(false)} title="Switch game" size={size}>
      <ul className="flex flex-col gap-1" role="listbox" aria-label="Select game">
        {games.map((game) => (
          <li key={game.id}>
            <button
              role="option"
              aria-selected={game.id === currentGame}
              onClick={() => {
                setCurrentGame(game.id);
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

export function GameSwitcherTrigger() {
  const { currentGame, games } = useGame();
  const current = games.find((g) => g.id === currentGame) ?? games[0];
  return (
    <Button variant="ghost" size="sm" aria-haspopup="listbox" aria-expanded="false">
      <Icon name="gamepad-2" size={20} />
      <span className="hidden sm:inline font-display text-body-sm">{current.label}</span>
      <Icon name="chevron-down" size={16} />
    </Button>
  );
}
