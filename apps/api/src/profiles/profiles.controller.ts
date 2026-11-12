import { Controller, Get, Post, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { JwtAuthGuard, type AuthedUser } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ProfilesService } from './profiles.service';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import { upsertProfileSchema, type UpsertProfile } from './profiles.schemas';
import { ConsentService } from '../consent/consent.service';

@Controller('profiles')
export class ProfilesController {
  constructor(
    private readonly profiles: ProfilesService,
    private readonly consent: ConsentService,
  ) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async listMyProfiles(@CurrentUser() user: AuthedUser) {
    return this.profiles.listMyProfiles(user.sub);
  }

  @Get('me/:gameKey')
  @UseGuards(JwtAuthGuard)
  async getMyProfile(@CurrentUser() user: AuthedUser, @Param('gameKey') gameKey: string) {
    return this.profiles.getProfile(user.sub, gameKey);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async upsertProfile(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(upsertProfileSchema)) body: UpsertProfile,
  ) {
    // Enforce terms acceptance before creating/updating any profile
    await this.consent.assertTermsAccepted(user.sub);
    return this.profiles.upsertProfile(user.sub, body);
  }

  @Get(':userId')
  async getPublicProfile(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.profiles.getPublicProfile(userId);
  }
}
