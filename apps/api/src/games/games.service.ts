import { Injectable, NotFoundException } from '@nestjs/common';
import { db, schema } from '../db/client';
import { eq } from 'drizzle-orm';

export interface GameFormatDto {
  id: string;
  key: string;
  name: string;
  resultSchema: Record<string, unknown>;
  requiredProof: string[];
  tiebreakRules: string | null;
}

export interface GameDto {
  id: string;
  key: string;
  name: string;
  status: string;
  idFields: Record<string, unknown>;
  formats: GameFormatDto[];
}

@Injectable()
export class GamesService {
  async listGames(): Promise<GameDto[]> {
    const rows = await db.select().from(schema.games).where(eq(schema.games.status, 'enabled'));
    return Promise.all(rows.map((row) => this.mapRow(row)));
  }

  async getGame(key: string): Promise<GameDto> {
    const row = await db.select().from(schema.games).where(eq(schema.games.key, key)).limit(1);

    if (!row[0]) throw new NotFoundException(`Game not found: ${key}`);

    return this.mapRow(row[0]);
  }

  private async mapRow(row: typeof schema.games.$inferSelect): Promise<GameDto> {
    const formats = await db
      .select()
      .from(schema.gameFormats)
      .where(eq(schema.gameFormats.gameId, row.id));

    return {
      id: row.id,
      key: row.key,
      name: row.name,
      status: row.status,
      idFields: (row.idFields as Record<string, unknown>) ?? {},
      formats: formats.map((f) => ({
        id: f.id,
        key: f.key,
        name: f.name,
        resultSchema: (f.resultSchema as Record<string, unknown>) ?? {},
        requiredProof: (f.requiredProof as string[]) ?? [],
        tiebreakRules: f.tiebreakRules,
      })),
    };
  }
}
