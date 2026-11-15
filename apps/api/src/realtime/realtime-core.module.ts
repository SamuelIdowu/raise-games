import { Module } from '@nestjs/common';
import { OutboxRelay } from './outbox-relay';
import { RealtimePublisher } from './realtime.publisher';

/**
 * Publisher + outbox relay, with no dependencies on feature modules, so matches and
 * chat can import it without a cycle through the gateway.
 */
@Module({
  providers: [RealtimePublisher, OutboxRelay],
  exports: [RealtimePublisher, OutboxRelay],
})
export class RealtimeCoreModule {}
