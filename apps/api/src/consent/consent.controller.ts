import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import { acceptConsentSchema, type AcceptConsent } from './consent.schemas';
import { ConsentService } from './consent.service';
import type { AuthedUser } from '../auth/jwt-auth.guard';
import type { FastifyRequest } from 'fastify';

@Controller('consent')
@UseGuards(JwtAuthGuard)
export class ConsentController {
  constructor(private readonly consent: ConsentService) {}

  @Get('status')
  async status(@CurrentUser() user: AuthedUser) {
    return this.consent.status(user.sub);
  }

  @Post('accept')
  async accept(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(acceptConsentSchema)) body: AcceptConsent,
    @Req() req: FastifyRequest,
  ) {
    return this.consent.accept(user.sub, body, req.ip);
  }
}
