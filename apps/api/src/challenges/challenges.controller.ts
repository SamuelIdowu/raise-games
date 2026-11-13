import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, type AuthedUser } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import { enforceRateLimit } from '../shared/rate-limit';
import { ChallengesService } from './challenges.service';
import { boardQuerySchema, type BoardQuery } from './challenges.schemas';

@Controller('challenges')
export class ChallengesController {
  constructor(private readonly challenges: ChallengesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async board(
    @CurrentUser() user: AuthedUser,
    @Query(new ZodValidationPipe(boardQuerySchema)) query: BoardQuery,
  ) {
    await enforceRateLimit(`rl:challenges:board:${user.sub}`, 120, 60_000);
    return this.challenges.listBoard(user.sub, query);
  }
}
