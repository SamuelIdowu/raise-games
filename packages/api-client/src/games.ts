import { apiFetch } from './fetch';

export interface IdField {
  key: string;
  label: string;
  type: 'text' | 'number';
  required: boolean;
}

export interface GameFormat {
  id: string;
  key: string;
  name: string;
  resultSchema: Record<string, unknown>;
  requiredProof: string[];
  tiebreakRules: string | null;
}

export interface Game {
  id: string;
  key: string;
  name: string;
  status: string;
  idFields: IdField[];
  formats: GameFormat[];
}

export const gamesApi = {
  list: () => apiFetch<Game[]>('/games'),

  get: (key: string) => apiFetch<Game>(`/games/${key}`),
};
