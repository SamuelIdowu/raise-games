import { Module, OnModuleInit } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MatchesModule } from '../matches/matches.module';
import { OutboxRelay } from '../realtime/outbox-relay';
import { RealtimeCoreModule } from '../realtime/realtime-core.module';
import { AdminChatController, ChatController } from './chat.controller';
import { ChatJobs } from './chat.jobs';
import { ChatService } from './chat.service';

@Module({
  imports: [AuthModule, MatchesModule, RealtimeCoreModule],
  controllers: [ChatController, AdminChatController],
  providers: [ChatService, ChatJobs],
  exports: [ChatService],
})
export class ChatModule implements OnModuleInit {
  constructor(
    private readonly relay: OutboxRelay,
    private readonly chat: ChatService,
  ) {}

  /** The match chat is auto-created on acceptance (F7.3), driven by `match.created`. */
  onModuleInit(): void {
    this.relay.register({
      name: 'match-chat-create',
      matches: (type) => type === 'match.created',
      handle: async (event) => {
        await this.chat.ensureMatchConversation(event.subjectId);
      },
    });
  }
}
