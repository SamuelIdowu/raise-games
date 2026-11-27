import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, type AuthedUser } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import { enforceRateLimit } from '../shared/rate-limit';
import { LeaderboardsService } from './leaderboards.service';
import {
  leaderboardParamSchema,
  leaderboardQuerySchema,
  type LeaderboardParam,
  type LeaderboardQuery,
} from './leaderboards.schemas';

@Controller('leaderboards')
@UseGuards(JwtAuthGuard)
export class LeaderboardsController {
  constructor(private readonly leaderboards: LeaderboardsService) {}

  /** Per-game board (F10.3). Clients poll and skip re-rendering when `version` is unchanged. */
  @Get(':gameKey')
  async page(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(leaderboardParamSchema)) params: LeaderboardParam,
    @Query(new ZodValidationPipe(leaderboardQuerySchema)) query: LeaderboardQuery,
  ) {
    await enforceRateLimit(`rl:leaderboards:${user.sub}`, 120, 60_000);
    return this.leaderboards.page(params.gameKey, user.sub, query);
  }
}
