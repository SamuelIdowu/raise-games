import { Controller, Get, Param } from '@nestjs/common';
import { GamesService } from './games.service';

@Controller('games')
export class GamesController {
  constructor(private readonly games: GamesService) {}

  @Get()
  async listGames() {
    return this.games.listGames();
  }

  @Get(':key')
  async getGame(@Param('key') key: string) {
    return this.games.getGame(key);
  }
}
