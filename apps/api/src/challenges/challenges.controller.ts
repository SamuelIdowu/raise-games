import {
  Controller,
  Get,
  Post,
  Patch,
  Query,
  Param,
  Body,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard, type AuthedUser } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import { enforceRateLimit } from '../shared/rate-limit';
import { ChallengesService } from './challenges.service';
import {
  boardQuerySchema,
  createChallengeSchema,
  challengeIdParamSchema,
  type BoardQuery,
  type CreateChallengeRequest,
  type ChallengeIdParam,
} from './challenges.schemas';

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

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async detail(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(challengeIdParamSchema)) params: ChallengeIdParam,
  ) {
    await enforceRateLimit(`rl:challenges:detail:${user.sub}`, 60, 60_000);
    const card = await this.challenges.getChallenge(params.id, user.sub);
    if (!card) throw new NotFoundException('Challenge not found');
    return card;
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(createChallengeSchema)) input: CreateChallengeRequest,
  ) {
    await enforceRateLimit(`rl:challenges:create:${user.sub}`, 30, 60_000);
    return this.challenges.createChallenge(user.sub, input);
  }

  @Patch(':id/accept')
  @UseGuards(JwtAuthGuard)
  async accept(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(challengeIdParamSchema)) params: ChallengeIdParam,
  ) {
    await enforceRateLimit(`rl:challenges:accept:${user.sub}`, 30, 60_000);
    return this.challenges.acceptChallenge(params.id, user.sub);
  }

  @Patch(':id/decline')
  @UseGuards(JwtAuthGuard)
  async decline(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(challengeIdParamSchema)) params: ChallengeIdParam,
  ) {
    await enforceRateLimit(`rl:challenges:decline:${user.sub}`, 30, 60_000);
    await this.challenges.declineChallenge(params.id, user.sub);
    return { success: true };
  }

  @Patch(':id/cancel')
  @UseGuards(JwtAuthGuard)
  async cancel(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(challengeIdParamSchema)) params: ChallengeIdParam,
  ) {
    await enforceRateLimit(`rl:challenges:cancel:${user.sub}`, 30, 60_000);
    await this.challenges.cancelChallenge(params.id, user.sub);
    return { success: true };
  }
}
