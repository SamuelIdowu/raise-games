import { Logger } from '@nestjs/common';
import webpush from 'web-push';
import { env } from '../config/env.instance';

/**
 * Delivery channels behind one port (TA: WhatsApp and SMS come later behind the same
 * interface). In-app delivery is the socket emit in NotificationsService; these cover
 * channels that leave the app.
 */
export interface OutboundMessage {
  title: string;
  body: string;
  /** Absolute URL to open (deep link into the web app). */
  url: string;
}

export type ChannelResult = { status: 'sent' } | { status: 'skipped'; reason: string };

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushChannel {
  readonly enabled: boolean;
  readonly publicKey: string | null;
  /** Throws on a transient failure (retried); returns 'gone' when the subscription is dead. */
  send(target: PushTarget, message: OutboundMessage): Promise<'sent' | 'gone'>;
}

export interface EmailChannel {
  readonly name: string;
  send(to: string, message: OutboundMessage): Promise<ChannelResult>;
}

/** Web push with VAPID keys (F11.4). Disabled (skips) when keys are not configured. */
export class WebPushChannel implements PushChannel {
  readonly enabled: boolean;
  readonly publicKey: string | null;

  constructor() {
    this.enabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
    this.publicKey = env.VAPID_PUBLIC_KEY ?? null;
    if (this.enabled) {
      webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
    }
  }

  async send(target: PushTarget, message: OutboundMessage): Promise<'sent' | 'gone'> {
    try {
      await webpush.sendNotification(target, JSON.stringify(message), { TTL: 60 * 60 * 24 });
      return 'sent';
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return 'gone';
      throw error;
    }
  }
}

/** Resend over HTTPS (no SDK). Used when RESEND_API_KEY is set. */
export class ResendEmailChannel implements EmailChannel {
  readonly name = 'resend';

  async send(to: string, message: OutboundMessage): Promise<ChannelResult> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to,
        subject: message.title,
        text: `${message.body}\n\nOpen RAISE: ${message.url}\n\nYou can change which emails you get in Inbox → Preferences.`,
      }),
    });
    if (res.status >= 500 || res.status === 429) throw new Error(`resend ${res.status}`);
    if (!res.ok) return { status: 'skipped', reason: `resend rejected (${res.status})` };
    return { status: 'sent' };
  }
}

/**
 * Development/test email: logs instead of sending and keeps the last messages in memory
 * so tests can assert on them. The vendor is an open owner decision (Resend vs SES).
 */
export class MockEmailChannel implements EmailChannel {
  readonly name = 'mock';
  private readonly logger = new Logger('MockEmail');
  static outbox: Array<{ to: string; message: OutboundMessage }> = [];

  async send(to: string, message: OutboundMessage): Promise<ChannelResult> {
    MockEmailChannel.outbox.push({ to, message });
    if (MockEmailChannel.outbox.length > 200) MockEmailChannel.outbox.shift();
    this.logger.log(`email to <redacted> — ${message.title}`);
    return { status: 'sent' };
  }
}

export function emailChannelFromEnv(): EmailChannel {
  return env.RESEND_API_KEY ? new ResendEmailChannel() : new MockEmailChannel();
}
