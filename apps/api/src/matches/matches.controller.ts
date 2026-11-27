import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard, type AuthedUser } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PlayConsentGuard } from '../consent/play-consent.guard';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import { enforceRateLimit } from '../shared/rate-limit';
import { MatchesService } from './matches.service';
import { ResultsService } from './results.service';
import {
  confirmResultSchema,
  listMatchesQuerySchema,
  matchIdParamSchema,
  reportNoShowSchema,
  submitResultSchema,
  type ConfirmResultRequest,
  type ListMatchesQuery,
  type MatchIdParam,
  type ReportNoShowRequest,
  type SubmitResultRequest,
} from './matches.schemas';

export const roomCodeSchema = z.object({ roomCode: z.string().max(64) });
type RoomCodeRequest = z.infer<typeof roomCodeSchema>;

@Controller('matches')
@UseGuards(JwtAuthGuard)
export class MatchesController {
  constructor(
    private readonly matches: MatchesService,
    private readonly results: ResultsService,
  ) {}

  /** The viewer's matches (Matches tab), as hub views. */
  @Get()
  async list(
    @CurrentUser() user: AuthedUser,
    @Query(new ZodValidationPipe(listMatchesQuerySchema)) query: ListMatchesQuery,
  ) {
    await enforceRateLimit(`rl:matches:list:${user.sub}`, 120, 60_000);
    return { items: await this.results.listMine(user, query) };
  }

  /**
   * The match room hub (F7.2 + F8.3). Also the polling fallback for live state: clients
   * poll this while the socket is down and keep the highest `version` they have seen.
   */
  @Get(':id')
  async view(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(matchIdParamSchema)) params: MatchIdParam,
  ) {
    await enforceRateLimit(`rl:matches:view:${user.sub}`, 240, 60_000);
    return this.matches.getView(params.id, user);
  }

  @Put(':id/room-code')
  async setRoomCode(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(matchIdParamSchema)) params: MatchIdParam,
    @Body(new ZodValidationPipe(roomCodeSchema)) body: RoomCodeRequest,
  ) {
    await enforceRateLimit(`rl:matches:room-code:${user.sub}`, 20, 60_000);
    return this.matches.setRoomCode(params.id, user, body.roomCode);
  }

  @Post(':id/result')
  @HttpCode(200)
  @UseGuards(PlayConsentGuard)
  async submit(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(matchIdParamSchema)) params: MatchIdParam,
    @Body(new ZodValidationPipe(submitResultSchema)) input: SubmitResultRequest,
  ) {
    await enforceRateLimit(`rl:matches:submit:${user.sub}`, 10, 60_000);
    return this.results.submitResult(user.sub, params.id, input);
  }

  @Post(':id/no-show')
  @HttpCode(200)
  @UseGuards(PlayConsentGuard)
  async noShow(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(matchIdParamSchema)) params: MatchIdParam,
    @Body(new ZodValidationPipe(reportNoShowSchema)) input: ReportNoShowRequest,
  ) {
    await enforceRateLimit(`rl:matches:noshow:${user.sub}`, 10, 60_000);
    return this.results.reportNoShow(user.sub, params.id, input);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  async confirm(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(matchIdParamSchema)) params: MatchIdParam,
    @Body(new ZodValidationPipe(confirmResultSchema)) input: ConfirmResultRequest,
  ) {
    await enforceRateLimit(`rl:matches:confirm:${user.sub}`, 10, 60_000);
    return this.results.confirmResult(user.sub, params.id, input);
  }
}
