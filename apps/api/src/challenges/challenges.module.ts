import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChallengesController } from './challenges.controller';
import { ChallengesService } from './challenges.service';
import { ChallengeExpiryWorker } from './challenges.expiry.worker';

@Module({
  imports: [AuthModule],
  controllers: [ChallengesController],
  providers: [ChallengesService, ChallengeExpiryWorker],
  exports: [ChallengesService],
})
export class ChallengesModule {}
