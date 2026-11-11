import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.controller';
import { ProfilesService } from './profiles.service';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import { upsertProfileSchema, type UpsertProfile } from './profiles.schemas';
import type { FastifyRequest } from 'fastify';

interface AuthedRequest extends FastifyRequest {
  user?: { sub: string };
}

@Controller('profiles')
@UseGuards(JwtAuthGuard)
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get('me')
  async listMyProfiles(@Req() req: AuthedRequest) {
    const userId = req.user?.sub;
    if (!userId) throw new NotFoundException('User not found');
    return this.profiles.listMyProfiles(userId);
  }

  @Get('me/:gameKey')
  async getMyProfile(@Req() req: AuthedRequest, @Param('gameKey') gameKey: string) {
    const userId = req.user?.sub;
    if (!userId) throw new NotFoundException('User not found');
    return this.profiles.getProfile(userId, gameKey);
  }

  @Post()
  async upsertProfile(
    @Req() req: AuthedRequest,
    @Body(new ZodValidationPipe(upsertProfileSchema)) body: UpsertProfile,
  ) {
    const userId = req.user?.sub;
    if (!userId) throw new NotFoundException('User not found');
    return this.profiles.upsertProfile(userId, body);
  }

  @Get(':userId')
  async getPublicProfile(@Param('userId') userId: string) {
    return this.profiles.getPublicProfile(userId);
  }
}
