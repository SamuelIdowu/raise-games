import { Injectable, Logger } from '@nestjs/common';
import type { OutboxEvent } from '../realtime/outbox-relay';

/**
 * Product analytics tied to the PRD success metrics (TA: "PostHog tied to the success
 * metrics"; Sprint 15 F15.4). Driven by the outbox, so no feature module changes and every
 * event is the committed truth, not a client guess. Uses PostHog's HTTP capture API
 * directly (no SDK); off unless POSTHOG_KEY is set.
 *
 * distinct_id is the pseudonymous user id. No phone, email or display name is ever sent.
 */
export const ANALYTICS_EVENT_TYPES = [
  'challenge.created',
  'challenge.accepted',
  'match.confirmed',
  'match.forfeited',
  'dispute.opened',
  'dispute.ruled',
] as const;

export interface AnalyticsCapture {
  event: string;
  distinctId: string;
  properties: Record<string, string | number | boolean | null>;
  timestamp: string;
}

/** Outbox event → analytics events (one per player where both matter). Pure. */
export function toAnalytics(e: OutboxEvent): AnalyticsCapture[] {
  const p = e.payload as Record<string, unknown>;
  const str = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : null);
  const at = new Date(e.createdAt).toISOString();
  const one = (event: string, who: string | null, properties: AnalyticsCapture['properties']) =>
    who ? [{ event, distinctId: who, properties, timestamp: at }] : [];

  switch (e.type) {
    case 'challenge.created':
      return one('challenge_posted', str('posterId'), {
        challenge_id: str('challengeId'),
        direct: Boolean(p.targetPlayerId),
      });
    case 'challenge.accepted':
      return one('challenge_accepted', str('acceptorId'), {
        challenge_id: str('challengeId'),
        match_id: str('matchId'),
      });
    case 'match.confirmed': {
      const props = {
        match_id: str('matchId'),
        via: str('via'),
        draw: Boolean(p.draw),
      };
      const ids = Array.isArray(p.participants) ? (p.participants as string[]) : [];
      return ids.map((id) => ({
        event: 'match_completed',
        distinctId: id,
        properties: props,
        timestamp: at,
      }));
    }
    case 'match.forfeited':
      return one('match_forfeited', str('forfeitingUserId'), { match_id: str('matchId') });
    case 'dispute.opened': {
      // Player-opened disputes name the opener; auto-opened ones (conflicting results)
      // list both participants. Dispute rate is a PRD success metric, so count both.
      const props = { match_id: str('matchId'), source: str('source'), reason: str('reason') };
      if (str('openedBy')) return one('dispute_opened', str('openedBy'), props);
      const ids = Array.isArray(p.participants) ? (p.participants as string[]) : [];
      return ids.map((id) => ({
        event: 'dispute_opened',
        distinctId: id,
        properties: props,
        timestamp: at,
      }));
    }
    case 'dispute.ruled':
      return (Array.isArray(p.participants) ? (p.participants as string[]) : []).map((id) => ({
        event: 'dispute_ruled',
        distinctId: id,
        properties: {
          match_id: str('matchId'),
          outcome: str('outcome'),
          round: typeof p.round === 'number' ? p.round : null,
          resolution_ms: typeof p.resolutionMs === 'number' ? p.resolutionMs : null,
        },
        timestamp: at,
      }));
    default:
      return [];
  }
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  get enabled(): boolean {
    return Boolean(process.env.POSTHOG_KEY);
  }

  async handle(event: OutboxEvent): Promise<void> {
    if (!this.enabled) return;
    const batch = toAnalytics(event);
    if (batch.length === 0) return;
    const host = process.env.POSTHOG_HOST ?? 'https://eu.i.posthog.com';
    const res = await fetch(`${host}/batch/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.POSTHOG_KEY,
        batch: batch.map((b) => ({
          event: b.event,
          distinct_id: b.distinctId,
          properties: { ...b.properties, $process_person_profile: false, source: 'api' },
          timestamp: b.timestamp,
        })),
      }),
      signal: AbortSignal.timeout(5000),
    });
    // A failure throws so the relay retries with backoff; analytics never blocks play.
    if (!res.ok) throw new Error(`PostHog ${res.status}`);
  }
}
