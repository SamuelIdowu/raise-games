/**
 * Time display (Design §9): "Sat 7 Nov, 6:30 pm WAT", in the user's timezone.
 * Stage 1 default is WAT; a stored profile timezone can replace DEFAULT_TZ later.
 */
export const DEFAULT_TZ = 'Africa/Lagos';
const TZ_ABBR: Record<string, string> = { 'Africa/Lagos': 'WAT' };

export function formatDateTime(iso: string, tz = DEFAULT_TZ): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: tz,
  });
  const time = d
    .toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz })
    .replace(/[\u202f\u00a0]/g, ' ')
    .toLowerCase();
  return `${day.replace(',', '')}, ${time} ${TZ_ABBR[tz] ?? tz}`;
}

/** "in 23h 10m", "in 4m", "2h ago". */
export function formatRelative(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const span = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m` : 'less than a minute';
  return diff >= 0 ? `in ${span}` : `${span} ago`;
}
