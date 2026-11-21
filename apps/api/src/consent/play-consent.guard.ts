import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthedRequest } from '../auth/jwt-auth.guard';
import { ConsentService } from './consent.service';

/** Machine-readable reason the web app uses to send the player to re-accept the terms. */
export const CONSENT_REQUIRED = 'consent_required';

/**
 * Blocks play actions until the player has accepted the current terms and privacy versions
 * (F3.3/F3.7, audit #2). Runs after `JwtAuthGuard`, so `request.user` is set.
 *
 * Applied at the HTTP edge to the actions that start or advance play: create and accept a
 * challenge, submit a result, claim a no-show, confirm, open or appeal a dispute, and start
 * a DM. Backing out (decline, cancel) and reading stay open, so a player asked to re-accept
 * is never trapped in a match they cannot leave.
 */
@Injectable()
export class PlayConsentGuard implements CanActivate {
  private readonly consent = new ConsentService();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user) return false;
    const status = await this.consent.status(user.sub);
    if (!status.playAllowed) {
      throw new ForbiddenException({
        code: CONSENT_REQUIRED,
        message: 'Accept the current terms and privacy policy to continue.',
      });
    }
    return true;
  }
}
