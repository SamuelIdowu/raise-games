import { Injectable, NotFoundException } from '@nestjs/common';
import { db, schema } from '../db/client';
import { eq, and } from 'drizzle-orm';
import { GamesService } from '../games/games.service';
import type { UpsertProfile } from './profiles.schemas';

export interface GameProfileDto {
  id: string;
  userId: string;
  gameId: string;
  gameKey: string;
  gameName: string;
  inGameId: string;
  city: string | null;
  campus: string | null;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  provisional: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ProfilesService {
  constructor(private readonly games: GamesService) {}

  async listMyProfiles(userId: string): Promise<GameProfileDto[]> {
    const rows = await db
      .select({
        id: schema.gameProfiles.id,
        userId: schema.gameProfiles.userId,
        gameId: schema.gameProfiles.gameId,
        inGameId: schema.gameProfiles.inGameId,
        city: schema.gameProfiles.city,
        campus: schema.gameProfiles.campus,
        rating: schema.gameProfiles.rating,
        wins: schema.gameProfiles.wins,
        losses: schema.gameProfiles.losses,
        draws: schema.gameProfiles.draws,
        streak: schema.gameProfiles.streak,
        provisional: schema.gameProfiles.provisional,
        createdAt: schema.gameProfiles.createdAt,
        updatedAt: schema.gameProfiles.updatedAt,
        gameKey: schema.games.key,
        gameName: schema.games.name,
      })
      .from(schema.gameProfiles)
      .innerJoin(schema.games, eq(schema.gameProfiles.gameId, schema.games.id))
      .where(eq(schema.gameProfiles.userId, userId));

    return rows.map((r) => this.toDto(r));
  }

  async getProfile(userId: string, gameKey: string): Promise<GameProfileDto> {
    const row = await db
      .select({
        id: schema.gameProfiles.id,
        userId: schema.gameProfiles.userId,
        gameId: schema.gameProfiles.gameId,
        inGameId: schema.gameProfiles.inGameId,
        city: schema.gameProfiles.city,
        campus: schema.gameProfiles.campus,
        rating: schema.gameProfiles.rating,
        wins: schema.gameProfiles.wins,
        losses: schema.gameProfiles.losses,
        draws: schema.gameProfiles.draws,
        streak: schema.gameProfiles.streak,
        provisional: schema.gameProfiles.provisional,
        createdAt: schema.gameProfiles.createdAt,
        updatedAt: schema.gameProfiles.updatedAt,
        gameKey: schema.games.key,
        gameName: schema.games.name,
      })
      .from(schema.gameProfiles)
      .innerJoin(schema.games, eq(schema.gameProfiles.gameId, schema.games.id))
      .where(and(eq(schema.gameProfiles.userId, userId), eq(schema.games.key, gameKey)))
      .limit(1);

    if (!row[0]) throw new NotFoundException(`Profile not found for game: ${gameKey}`);

    return this.toDto(row[0]);
  }

  async getProfileById(id: string): Promise<GameProfileDto | null> {
    const row = await db
      .select({
        id: schema.gameProfiles.id,
        userId: schema.gameProfiles.userId,
        gameId: schema.gameProfiles.gameId,
        inGameId: schema.gameProfiles.inGameId,
        city: schema.gameProfiles.city,
        campus: schema.gameProfiles.campus,
        rating: schema.gameProfiles.rating,
        wins: schema.gameProfiles.wins,
        losses: schema.gameProfiles.losses,
        draws: schema.gameProfiles.draws,
        streak: schema.gameProfiles.streak,
        provisional: schema.gameProfiles.provisional,
        createdAt: schema.gameProfiles.createdAt,
        updatedAt: schema.gameProfiles.updatedAt,
        gameKey: schema.games.key,
        gameName: schema.games.name,
      })
      .from(schema.gameProfiles)
      .innerJoin(schema.games, eq(schema.gameProfiles.gameId, schema.games.id))
      .where(eq(schema.gameProfiles.id, id))
      .limit(1);

    if (!row[0]) return null;
    return this.toDto(row[0]);
  }

  async getPublicProfile(userId: string): Promise<GameProfileDto[]> {
    return this.listMyProfiles(userId);
  }

  async upsertProfile(userId: string, data: UpsertProfile): Promise<GameProfileDto> {
    // Validate game exists
    const game = await this.games.getGame(data.gameKey);

    // Check if profile already exists for this user+game
    const existing = await db
      .select()
      .from(schema.gameProfiles)
      .where(and(eq(schema.gameProfiles.userId, userId), eq(schema.gameProfiles.gameId, game.id)))
      .limit(1);

    if (existing[0]) {
      await db
        .update(schema.gameProfiles)
        .set({
          inGameId: data.inGameId,
          city: data.city ?? null,
          campus: data.campus ?? null,
          updatedAt: new Date(),
        })
        .where(eq(schema.gameProfiles.id, existing[0].id));

      return this.getProfile(userId, data.gameKey);
    }

    await db.insert(schema.gameProfiles).values({
      id: crypto.randomUUID(),
      userId,
      gameId: game.id,
      inGameId: data.inGameId,
      city: data.city ?? null,
      campus: data.campus ?? null,
      rating: 1000,
      wins: 0,
      losses: 0,
      draws: 0,
      streak: 0,
      provisional: true,
    });

    return this.getProfile(userId, data.gameKey);
  }

  private toDto(row: {
    id: string;
    userId: string;
    gameId: string;
    inGameId: string;
    city: string | null;
    campus: string | null;
    rating: number;
    wins: number;
    losses: number;
    draws: number;
    streak: number;
    provisional: boolean;
    createdAt: Date;
    updatedAt: Date;
    gameKey: string;
    gameName: string;
  }): GameProfileDto {
    return {
      id: row.id,
      userId: row.userId,
      gameId: row.gameId,
      gameKey: row.gameKey,
      gameName: row.gameName,
      inGameId: row.inGameId,
      city: row.city,
      campus: row.campus,
      rating: row.rating,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      streak: row.streak,
      provisional: row.provisional,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
