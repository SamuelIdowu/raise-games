'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

const GAMES = [
  { id: 'efootball', label: 'eFootball', icon: 'gamepad-2' },
  { id: 'codm', label: 'Call of Duty: Mobile', icon: 'gamepad-2' },
  { id: 'pubg_mobile', label: 'PUBG Mobile', icon: 'gamepad-2' },
] as const;

export type GameId = (typeof GAMES)[number]['id'];

interface GameContextValue {
  currentGame: GameId;
  setCurrentGame: (id: GameId) => void;
  games: typeof GAMES;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [currentGame, setCurrentGame] = useState<GameId>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('raise-current-game') as GameId | null;
      if (saved && GAMES.some((g) => g.id === saved)) return saved;
    }
    return 'efootball';
  });

  useEffect(() => {
    localStorage.setItem('raise-current-game', currentGame);
  }, [currentGame]);

  return (
    <GameContext.Provider value={{ currentGame, setCurrentGame, games: GAMES }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within a GameProvider');
  return ctx;
}
