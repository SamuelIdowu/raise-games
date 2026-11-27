/**
 * Product analytics (PostHog capture API). No SDK, to stay inside the route JS
 * budget (Design §11). A no-op unless NEXT_PUBLIC_POSTHOG_KEY is set.
 */
const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

function distinctId(): string {
  try {
    const existing = localStorage.getItem('raise_anon_id');
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem('raise_anon_id', id);
    return id;
  } catch {
    return 'anonymous';
  }
}

export function track(
  event: string,
  properties: Record<string, string | number | boolean | null> = {},
) {
  if (!KEY || typeof window === 'undefined') return;
  const body = JSON.stringify({
    api_key: KEY,
    event,
    distinct_id: distinctId(),
    properties: { ...properties, $current_url: window.location.pathname },
  });
  try {
    if (navigator.sendBeacon?.(`${HOST}/capture/`, body)) return;
    void fetch(`${HOST}/capture/`, { method: 'POST', body, keepalive: true }).catch(
      () => undefined,
    );
  } catch {
    // analytics must never break the flow
  }
}
