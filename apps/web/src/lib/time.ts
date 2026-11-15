/**
 * Times display in the user's timezone, WAT by default (Design §8 Match timeline).
 */
export const DEFAULT_TIME_ZONE = 'Africa/Lagos';

export function userTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** "2h 14m", "4m 05s", "3d 2h". Negative or zero → null (the caller says it passed). */
export function formatDuration(ms: number): string | null {
  if (ms <= 0) return null;
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

/** "Sat 14 Nov, 21:30 WAT" in the given zone. */
export function formatAbsolute(iso: string, timeZone: string = userTimeZone()): string {
  return new Intl.DateTimeFormat('en-NG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
    timeZoneName: 'short',
  }).format(new Date(iso));
}

/** "21:30" for chat timestamps. */
export function formatClock(iso: string, timeZone: string = userTimeZone()): string {
  return new Intl.DateTimeFormat('en-NG', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(new Date(iso));
}

/** "Sat 14 Nov, 18:00–20:00 WAT" (same day) or "Sat 14 Nov, 23:00 – Sun 15 Nov, 01:00 WAT". */
export function formatTimeWindow(
  startIso: string,
  endIso: string,
  timeZone: string = userTimeZone(),
): string {
  const day = new Intl.DateTimeFormat('en-NG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone,
  });
  const time = new Intl.DateTimeFormat('en-NG', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  });
  const zone =
    new Intl.DateTimeFormat('en-NG', { timeZone, timeZoneName: 'short' })
      .formatToParts(new Date(startIso))
      .find((p) => p.type === 'timeZoneName')?.value ?? '';
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameDay = day.format(start) === day.format(end);
  return sameDay
    ? `${day.format(start)}, ${time.format(start)}–${time.format(end)} ${zone}`.trim()
    : `${day.format(start)}, ${time.format(start)} – ${day.format(end)}, ${time.format(end)} ${zone}`.trim();
}
