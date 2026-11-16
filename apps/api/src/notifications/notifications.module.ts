import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthModule } from '../auth/auth.module';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard, type AuthedUser } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RealtimeCoreModule } from '../realtime/realtime-core.module';
import { enforceRateLimit } from '../shared/rate-limit';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import { NOTIFICATION_TYPES } from './catalog';
import { NotificationsService } from './notifications.service';
import { NotificationsWorker } from './notifications.worker';

const listQuery = z.object({
  before: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
const readBody = z.object({ ids: z.union([z.literal('all'), z.array(z.uuid()).min(1).max(200)]) });
const minute = z.number().int().min(0).max(1439).nullable();
const settingsBody = z.object({
  types: z
    .array(z.object({ type: z.enum(NOTIFICATION_TYPES), push: z.boolean(), email: z.boolean() }))
    .max(NOTIFICATION_TYPES.length)
    .optional(),
  quietHours: z
    .object({ startMinute: minute, endMinute: minute, timeZone: z.string().min(1).max(64) })
    .refine(
      (q) => (q.startMinute === null) === (q.endMinute === null),
      'Set both start and end, or neither',
    )
    .refine((q) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: q.timeZone });
        return true;
      } catch {
        return false;
      }
    }, 'Unknown time zone')
    .optional(),
  email: z.email().max(254).nullable().optional(),
});
const pushBody = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
const unsubscribeBody = z.object({ endpoint: z.url().max(2000) });
const idParam = z.object({ id: z.uuid() });

@Controller()
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('notifications')
  async list(
    @CurrentUser() user: AuthedUser,
    @Query(new ZodValidationPipe(listQuery)) q: z.infer<typeof listQuery>,
  ) {
    await enforceRateLimit(`rl:notifications:list:${user.sub}`, 120, 60_000);
    return this.notifications.list(user, q);
  }

  @Get('notifications/unread-count')
  async unread(@CurrentUser() user: AuthedUser) {
    await enforceRateLimit(`rl:notifications:unread:${user.sub}`, 240, 60_000);
    return { unread: await this.notifications.unreadCount(user.sub) };
  }

  @Post('notifications/read')
  @HttpCode(200)
  read(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(readBody)) body: z.infer<typeof readBody>,
  ) {
    return this.notifications.markRead(user, body.ids);
  }

  @Get('notifications/settings')
  settings(@CurrentUser() user: AuthedUser) {
    return this.notifications.getSettings(user);
  }

  @Put('notifications/settings')
  async updateSettings(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(settingsBody)) body: z.infer<typeof settingsBody>,
  ) {
    await enforceRateLimit(`rl:notifications:settings:${user.sub}`, 30, 60_000);
    return this.notifications.updateSettings(user, body);
  }

  @Post('notifications/push-subscriptions')
  @HttpCode(204)
  async subscribe(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(pushBody)) body: z.infer<typeof pushBody>,
  ) {
    await enforceRateLimit(`rl:notifications:push:${user.sub}`, 20, 3_600_000);
    await this.notifications.subscribePush(user, body);
  }

  @Delete('notifications/push-subscriptions')
  @HttpCode(204)
  async unsubscribe(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(unsubscribeBody)) body: z.infer<typeof unsubscribeBody>,
  ) {
    await this.notifications.unsubscribePush(user, body.endpoint);
  }

  /** Inbox Messages tab: match chats (DMs join if Sprint 14 ships). */
  @Get('inbox/conversations')
  async conversations(@CurrentUser() user: AuthedUser) {
    await enforceRateLimit(`rl:inbox:conversations:${user.sub}`, 120, 60_000);
    return { items: await this.notifications.conversations(user) };
  }

  @Post('inbox/conversations/:id/read')
  @HttpCode(204)
  async conversationRead(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(idParam)) p: z.infer<typeof idParam>,
  ) {
    await this.notifications.markConversationRead(user, p.id);
  }
}

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('moderator', 'admin')
export class AdminNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Failed-delivery counters for the M4 ops alert. */
  @Get('metrics/notifications')
  health() {
    return this.notifications.deliveryHealth();
  }
}

@Module({
  imports: [AuthModule, RealtimeCoreModule],
  controllers: [NotificationsController, AdminNotificationsController],
  providers: [NotificationsService, NotificationsWorker],
  exports: [NotificationsService],
})
export class NotificationsModule {}
