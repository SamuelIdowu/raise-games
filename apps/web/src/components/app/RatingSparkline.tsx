import type { MatchView } from '@raise/api-client';

/**
 * Rating over the last confirmed matches, rebuilt backwards from the current rating and
 * each match's `ratingDelta`. No history endpoint needed; returns null with < 2 points.
 */
export function ratingSeries(current: number, finishedNewestFirst: MatchView[]): number[] {
  const deltas = finishedNewestFirst
    .filter((m) => m.ratingDelta !== null)
    .map((m) => m.ratingDelta as number)
    .slice(0, 20);
  const points = [current];
  for (const d of deltas) points.push(points[points.length - 1]! - d);
  return points.reverse();
}

export function RatingSparkline({
  points,
  height = 64,
  className,
}: {
  points: number[];
  height?: number;
  className?: string;
}) {
  if (points.length < 2) return null;
  const width = 240;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(max - min, 10);
  const x = (i: number) => (i / (points.length - 1)) * width;
  const y = (v: number) => height - 4 - ((v - min) / span) * (height - 8);
  const d = points
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ');
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const change = last - first;

  return (
    <figure className={className}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-16 w-full overflow-visible text-accent"
        role="img"
        aria-label={`Rating moved from ${first} to ${last} over the last ${points.length - 1} matches`}
      >
        <path d={`${d} L${width},${height} L0,${height} Z`} className="fill-accent/15" />
        <path
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={x(points.length - 1)} cy={y(last)} r="3" className="fill-accent" />
      </svg>
      <figcaption className="mt-2 flex justify-between text-caption text-fg-subtle tabular">
        <span>Last {points.length - 1} matches</span>
        <span className={change >= 0 ? 'text-success' : 'text-danger'}>
          {change >= 0 ? `+${change}` : change}
        </span>
      </figcaption>
    </figure>
  );
}
