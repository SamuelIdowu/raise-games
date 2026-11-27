import { cn } from '@/lib/cn';

/**
 * Blocks.fun §6.1 pixel icons: 12x12 grid, chunky pixels, no anti-aliasing,
 * finished with a sharp offset shadow. Each "X" in a grid is one pixel.
 */
const GRIDS = {
  star: [
    '.....XX.....',
    '.....XX.....',
    '....XXXX....',
    'XXXXXXXXXXXX',
    '.XXXXXXXXXX.',
    '..XXXXXXXX..',
    '...XXXXXX...',
    '..XXXXXXXX..',
    '..XXX..XXX..',
    '.XXX....XXX.',
    '.XX......XX.',
    '............',
  ],
  crown: [
    '............',
    'X....XX....X',
    'XX...XX...XX',
    'XXX.XXXX.XXX',
    'XXXXXXXXXXXX',
    'XXXXXXXXXXXX',
    'XXXXXXXXXXXX',
    '.XXXXXXXXXX.',
    '............',
    '.XXXXXXXXXX.',
    '.XXXXXXXXXX.',
    '............',
  ],
  flame: [
    '.....X......',
    '.....XX.....',
    '....XXX.....',
    '....XXXX..X.',
    '...XXXXX.XX.',
    '..XXXXXXXXX.',
    '..XXXX.XXXX.',
    '.XXXX...XXXX',
    '.XXX.....XXX',
    '.XXX.....XXX',
    '..XXX...XXX.',
    '...XXXXXXX..',
  ],
  heart: [
    '............',
    '.XXX....XXX.',
    'XXXXX..XXXXX',
    'XXXXXXXXXXXX',
    'XXXXXXXXXXXX',
    'XXXXXXXXXXXX',
    '.XXXXXXXXXX.',
    '..XXXXXXXX..',
    '...XXXXXX...',
    '....XXXX....',
    '.....XX.....',
    '............',
  ],
  coin: [
    '...XXXXXX...',
    '..XX....XX..',
    '.XX..XX..XX.',
    'XX..XXXX..XX',
    'XX..XX....XX',
    'XX..XXXX..XX',
    'XX....XX..XX',
    'XX..XXXX..XX',
    '.XX..XX..XX.',
    '..XX....XX..',
    '...XXXXXX...',
    '............',
  ],
  bolt: [
    '......XXXX..',
    '.....XXXX...',
    '....XXXX....',
    '...XXXX.....',
    '..XXXXXXXX..',
    '.XXXXXXXX...',
    '.....XXX....',
    '....XXX.....',
    '...XXX......',
    '..XX........',
    '.X..........',
    '............',
  ],
  chat: [
    '.XXXXXXXXXX.',
    'XXXXXXXXXXXX',
    'XX........XX',
    'XX.XX.XX..XX',
    'XX........XX',
    'XXXXXXXXXXXX',
    '.XXXXXXXXXX.',
    '..XX........',
    '.XX.........',
    'XX..........',
    '............',
    '............',
  ],
  gamepad: [
    '............',
    '............',
    '.XXXXXXXXXX.',
    'XXXXXXXXXXXX',
    'XX.XXXXXX.XX',
    'X...XXXX.X.X',
    'XX.XXXXXX.XX',
    'XXXXXXXXXXXX',
    'XXXX....XXXX',
    'XXX......XXX',
    '.X........X.',
    '............',
  ],
  shield: [
    '.XXXXXXXXXX.',
    'XXXXXXXXXXXX',
    'XXXXXXXXXXXX',
    'XXXXXXXXX.XX',
    'XXXXXXXX..XX',
    'XX.XXXX..XXX',
    'XX..XX..XXXX',
    '.XX....XXXX.',
    '.XXX..XXXXX.',
    '..XXXXXXXX..',
    '...XXXXXX...',
    '.....XX.....',
  ],
} as const;

export type PixelIconName = keyof typeof GRIDS;

const PATHS = Object.fromEntries(
  Object.entries(GRIDS).map(([name, rows]) => [
    name,
    rows
      .flatMap((row, y) => [...row].map((cell, x) => (cell === 'X' ? `M${x} ${y}h1v1H${x}z` : '')))
      .join(''),
  ]),
) as Record<PixelIconName, string>;

export interface PixelIconProps {
  name: PixelIconName;
  size?: number;
  /** Sharp offset shadow (on by default). */
  shadow?: boolean;
  className?: string;
  title?: string;
}

export function PixelIcon({ name, size = 24, shadow = true, className, title }: PixelIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      shapeRendering="crispEdges"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn('shrink-0', shadow && 'drop-hard-sm', className)}
    >
      <path fill="currentColor" d={PATHS[name]} />
    </svg>
  );
}
