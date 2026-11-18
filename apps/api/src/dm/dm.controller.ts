import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard, type AuthedRequest, type AuthedUser } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import { enforceRateLimit } from '../shared/rate-limit';
import {
  listMessagesQuerySchema,
  reportMessageSchema,
  sendMessageSchema,
  type ListMessagesQuery,
  type ReportMessageRequest,
  type SendMessageRequest,
} from '../chat/chat.schemas';
import { DmEnabledGuard } from './dm.flag';
import { DmService } from './dm.service';

const userParam = z.object({ userId: z.uuid() });
const idParam = z.object({ id: z.uuid() });
const messageParam = z.object({ id: z.uuid(), messageId: z.uuid() });
const requestAction = z.object({ id: z.uuid(), action: z.enum(['accept', 'decline', 'cancel']) });
const openBody = z.object({ userId: z.uuid() });
const muteBody = z.object({ muted: z.boolean() });

/**
 * Restricted DMs + friend requests (Sprint 14). Everything here 404s while the
 * `messaging.dm` flag is off (DmEnabledGuard runs after auth).
 */
@Controller('dm')
@UseGuards(JwtAuthGuard, DmEnabledGuard)
export class DmController {
  constructor(private readonly dm: DmService) {}

  @Get('status')
  status(@CurrentUser() user: AuthedUser) {
    return this.dm.status(user);
  }

  @Get('relationship/:userId')
  async relationship(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(userParam)) p: z.infer<typeof userParam>,
  ) {
    await enforceRateLimit(`rl:dm:rel:${user.sub}`, 120, 60_000);
    return this.dm.relationship(user, p.userId);
  }

  // ---------------------------------------------------------------- friends

  @Get('friend-requests')
  requests(@CurrentUser() user: AuthedUser) {
    return this.dm.requests(user);
  }

  @Post('friend-requests')
  async request(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(openBody)) b: z.infer<typeof openBody>,
  ) {
    await enforceRateLimit(`rl:dm:friend:${user.sub}`, 20, 86_400_000);
    return this.dm.requestFriend(user, b.userId);
  }

  @Post('friend-requests/:id/:action')
  async respond(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(requestAction)) p: z.infer<typeof requestAction>,
  ) {
    await enforceRateLimit(`rl:dm:respond:${user.sub}`, 60, 60_000);
    return this.dm.respond(user, p.id, p.action);
  }

  @Delete('friends/:userId')
  async unfriend(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(userParam)) p: z.infer<typeof userParam>,
  ) {
    await enforceRateLimit(`rl:dm:respond:${user.sub}`, 60, 60_000);
    return this.dm.removeFriend(user, p.userId);
  }

  // ---------------------------------------------------------------- conversations

  @Get('conversations')
  async list(@CurrentUser() user: AuthedUser) {
    await enforceRateLimit(`rl:dm:list:${user.sub}`, 120, 60_000);
    return { items: await this.dm.list(user) };
  }

  @Post('conversations')
  async open(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(openBody)) b: z.infer<typeof openBody>,
  ) {
    await enforceRateLimit(`rl:dm:open:${user.sub}`, 30, 60_000);
    return this.dm.open(user, b.userId);
  }

  @Get('conversations/:id')
  get(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(idParam)) p: z.infer<typeof idParam>,
  ) {
    return this.dm.get(user, p.id);
  }

  @Get('conversations/:id/messages')
  async messages(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(idParam)) p: z.infer<typeof idParam>,
    @Query(new ZodValidationPipe(listMessagesQuerySchema)) q: ListMessagesQuery,
  ) {
    await enforceRateLimit(`rl:chat:list:${user.sub}`, 90, 60_000);
    return this.dm.messages(user, p.id, q);
  }

  @Post('conversations/:id/messages')
  send(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(idParam)) p: z.infer<typeof idParam>,
    @Body(new ZodValidationPipe(sendMessageSchema)) b: SendMessageRequest,
  ) {
    return this.dm.send(user, p.id, b);
  }

  @Post('conversations/:id/messages/:messageId/report')
  async report(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(messageParam)) p: z.infer<typeof messageParam>,
    @Body(new ZodValidationPipe(reportMessageSchema)) b: ReportMessageRequest,
    @Req() req: AuthedRequest,
  ) {
    await enforceRateLimit(`rl:chat:report:${user.sub}`, 20, 3_600_000);
    return this.dm.report(user, p.id, p.messageId, b, req.ip);
  }

  @Post('conversations/:id/mute')
  mute(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(idParam)) p: z.infer<typeof idParam>,
    @Body(new ZodValidationPipe(muteBody)) b: z.infer<typeof muteBody>,
    @Req() req: AuthedRequest,
  ) {
    return this.dm.mute(user, p.id, b.muted, req.ip);
  }

  @Post('conversations/:id/read')
  @HttpCode(204)
  async read(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(idParam)) p: z.infer<typeof idParam>,
  ) {
    await this.dm.markRead(user, p.id);
  }
}
