import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard, type AuthedUser } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import { enforceRateLimit } from '../shared/rate-limit';
import { MatchesService } from './matches.service';

export const matchIdParamSchema = z.object({ id: z.uuid() });
type MatchIdParam = z.infer<typeof matchIdParamSchema>;

export const roomCodeSchema = z.object({ roomCode: z.string().max(64) });
type RoomCodeRequest = z.infer<typeof roomCodeSchema>;

@Controller('matches')
export class MatchesController {
  constructor(private readonly matches: MatchesService) {}

  /**
   * The match room hub (F7.2). Also the polling fallback for live state: clients poll
   * this while the socket is down and keep the highest `version` they have seen.
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async view(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(matchIdParamSchema)) params: MatchIdParam,
  ) {
    // Sized for a 5s poll from two tabs plus normal navigation.
    await enforceRateLimit(`rl:matches:view:${user.sub}`, 60, 60_000);
    return this.matches.getView(params.id, user);
  }

  @Put(':id/room-code')
  @UseGuards(JwtAuthGuard)
  async setRoomCode(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(matchIdParamSchema)) params: MatchIdParam,
    @Body(new ZodValidationPipe(roomCodeSchema)) body: RoomCodeRequest,
  ) {
    await enforceRateLimit(`rl:matches:room-code:${user.sub}`, 20, 60_000);
    return this.matches.setRoomCode(params.id, user, body.roomCode);
  }
}
