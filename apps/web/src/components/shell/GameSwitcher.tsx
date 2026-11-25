'use client';

import { useState } from 'react';
import { useGame } from './GameProvider';
import { Icon, PixelIcon, Sheet, type SheetProps } from '@/components/ui';
import { cn } from '@/lib/cn';

interface GameSwitcherProps extends Pick<SheetProps, 'size'> {
  /** Hide the game name, show only the pixel pad (tight mobile header). */
  compact?: boolean;
  className?: string;
}

/** Trigger chip + picker sheet. The current game is a uppercase chip like the reference fee-tier chip. */
export function GameSwitcher({ size = 'sm', compact = false, className }: GameSwitcherProps) {
  const { currentGame, setCurrentGame, games } = useGame();
  const [open, setOpen] = useState(false);
  const current = games.find((g) => g.id === currentGame) ?? games[0];

  return (
    <>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Game: ${current.label}. Change game`}
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex h-9 items-center gap-2 rounded-control border border-line px-3 text-fg transition-colors hover:border-line-strong',
          className,
        )}
      >
        <PixelIcon name="gamepad" size={16} className="text-accent" />
        {!compact && (
          <span className="hidden max-w-[10rem] truncate sm:inline font-display text-[10px] font-bold uppercase tracking-[0.08em]">
            {current.label}
          </span>
        )}
        <Icon name="chevron-down" size={14} className="text-fg-subtle" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Switch game" size={size}>
        <ul className="flex flex-col gap-2" role="listbox" aria-label="Select game">
          {games.map((game) => {
            const selected = game.id === currentGame;
            return (
              <li key={game.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    setCurrentGame(game.id);
                    setOpen(false);
                  }}
                  className={cn(
                    'surface-card flex min-h-12 w-full items-center gap-3 rounded-card px-4 text-left transition-colors hover:border-line-strong',
                    selected && 'border-accent',
                  )}
                >
                  <PixelIcon
                    name="gamepad"
                    size={20}
                    className={selected ? 'text-accent' : 'text-fg-subtle'}
                  />
                  <span className="font-display text-[12px] font-bold uppercase tracking-[0.04em] text-fg">
                    {game.label}
                  </span>
                  {selected && <Icon name="check" size={18} className="ml-auto text-accent" />}
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
}

/** @deprecated The switcher renders its own trigger now. */
export function GameSwitcherTrigger() {
  return <GameSwitcher />;
}
