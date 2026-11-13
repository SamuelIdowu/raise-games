import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, type AuthedUser } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import { enforceRateLimit } from '../shared/rate-limit';
import { PlayersService } from './players.service';
import { playerSearchSchema, type PlayerSearchQuery } from './players.schemas';

@Controller('players')
export class PlayersController {
  constructor(private readonly players: PlayersService) {}

  @Get('search')
  @UseGuards(JwtAuthGuard)
  async search(
    @CurrentUser() user: AuthedUser,
    @Query(new ZodValidationPipe(playerSearchSchema)) query: PlayerSearchQuery,
  ) {
    await enforceRateLimit(`rl:players:search:${user.sub}`, 60, 60_000);
    return this.players.search(user.sub, query);
  }
}
