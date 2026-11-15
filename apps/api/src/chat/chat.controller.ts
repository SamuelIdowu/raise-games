import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, type AuthedRequest, type AuthedUser } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import { enforceRateLimit } from '../shared/rate-limit';
import { ChatService } from './chat.service';
import {
  listMessagesQuerySchema,
  matchChatParamSchema,
  messageParamSchema,
  reportMessageSchema,
  sendMessageSchema,
  userParamSchema,
  type ListMessagesQuery,
  type MatchChatParam,
  type MessageParam,
  type ReportMessageRequest,
  type SendMessageRequest,
  type UserParam,
} from './chat.schemas';

/**
 * Match chat over HTTP. The socket `chat:send` event is the primary path; POST here is
 * the fallback while the socket is down, with the same validation, limits and dedupe.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('matches/:matchId/chat/messages')
  async list(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(matchChatParamSchema)) params: MatchChatParam,
    @Query(new ZodValidationPipe(listMessagesQuerySchema)) query: ListMessagesQuery,
  ) {
    await enforceRateLimit(`rl:chat:list:${user.sub}`, 90, 60_000);
    return this.chat.listMessages(params.matchId, user, query);
  }

  @Post('matches/:matchId/chat/messages')
  async send(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(matchChatParamSchema)) params: MatchChatParam,
    @Body(new ZodValidationPipe(sendMessageSchema)) input: SendMessageRequest,
  ) {
    return this.chat.send(user, params.matchId, input);
  }

  @Post('matches/:matchId/chat/messages/:messageId/report')
  async report(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(messageParamSchema)) params: MessageParam,
    @Body(new ZodValidationPipe(reportMessageSchema)) input: ReportMessageRequest,
  ) {
    await enforceRateLimit(`rl:chat:report:${user.sub}`, 20, 3_600_000);
    return this.chat.report(user, params.matchId, params.messageId, input);
  }

  @Post('blocks/:userId')
  @HttpCode(204)
  async block(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(userParamSchema)) params: UserParam,
  ) {
    await enforceRateLimit(`rl:blocks:${user.sub}`, 30, 3_600_000);
    await this.chat.block(user, params.userId);
  }
}

/** Staff evidence read (F7.4). Moderator or admin; every read is audited. */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('moderator', 'admin')
export class AdminChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('matches/:matchId/chat')
  async read(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(matchChatParamSchema)) params: MatchChatParam,
    @Query(new ZodValidationPipe(listMessagesQuerySchema)) query: ListMessagesQuery,
    @Req() req: AuthedRequest,
  ) {
    return this.chat.adminRead(user, params.matchId, query, req.ip);
  }
}
