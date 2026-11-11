import { cn } from '@/lib/cn';

function hash(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0;
  }
  return result;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = [parts[0]?.[0], parts[1]?.[0]].filter(Boolean).join('');
  return (letters || name.slice(0, 2)).toUpperCase();
}

export interface AvatarProps {
  username: string;
  size?: 32 | 64;
  className?: string;
}

/** Square, 2px radius, initials fallback with a deterministic pattern (no photo upload, Stage 1). */
export function Avatar({ username, size = 32, className }: AvatarProps) {
  const hue = hash(username) % 360;
  const background = `linear-gradient(135deg, hsl(${hue} 45% 22%), hsl(${(hue + 40) % 360} 45% 15%))`;

  return (
    <span
      role="img"
      aria-label={username}
      style={{ background }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[2px] border border-line-strong font-display font-semibold text-fg',
        size === 32 ? 'size-8 text-[12px]' : 'size-16 text-h3',
        className,
      )}
    >
      {initials(username)}
    </span>
  );
}
