import { cn } from '@/lib/cn';

type Vec = readonly [number, number];
type Tone = 'a' | 'b' | 'c' | 'd';

const FILL: Record<Tone, string> = {
  a: 'var(--accent)',
  b: 'var(--brand)',
  c: 'var(--cream)',
  d: 'var(--accent-ink)',
};

// 3x3 stickers per face, row-major. Mostly one colour per face with a few swaps,
// like the Rubik-style mascot in the reference.
const FACES: Array<{ origin: Vec; u: Vec; v: Vec; cells: Tone[] }> = [
  // top: L(20,50) -> T(100,10) along u, -> C(100,90) along v
  {
    origin: [20, 50],
    u: [80, -40],
    v: [80, 40],
    cells: ['a', 'a', 'c', 'a', 'd', 'a', 'b', 'a', 'a'],
  },
  // left: L(20,50) -> C(100,90) along u, down along v
  {
    origin: [20, 50],
    u: [80, 40],
    v: [0, 90],
    cells: ['c', 'c', 'a', 'c', 'b', 'c', 'c', 'c', 'b'],
  },
  // right: C(100,90) -> R(180,50) along u, down along v
  {
    origin: [100, 90],
    u: [80, -40],
    v: [0, 90],
    cells: ['b', 'b', 'b', 'c', 'b', 'a', 'b', 'b', 'b'],
  },
];

function cell(origin: Vec, u: Vec, v: Vec, i: number, j: number) {
  const at = (s: number, t: number) =>
    `${origin[0] + (u[0] * s + v[0] * t) / 3},${origin[1] + (u[1] * s + v[1] * t) / 3}`;
  return [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)].join(' ');
}

/** Isometric pixel cube illustration with a sharp offset shadow (decorative). */
export function PixelCube({ size = 200, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      aria-hidden
      className={cn('drop-hard [--hard-ink:var(--shadow-ink)]', className)}
    >
      {FACES.map((face, f) =>
        face.cells.map((tone, index) => (
          <polygon
            key={`${f}-${index}`}
            points={cell(face.origin, face.u, face.v, index % 3, Math.floor(index / 3))}
            fill={FILL[tone]}
            stroke="var(--bg-0)"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        )),
      )}
    </svg>
  );
}
