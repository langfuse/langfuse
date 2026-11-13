/** Generated keyframes for motion that depends on the content: a packet along a wire, a crosshair across a series. */

import type { CSSProperties } from "react";
import { startAt } from "./motion";
import { round, type Point } from "./projection";

export type Keyframes = { name: string; css: string; duration: number };

const percent = (n: number) => `${round(n * 100)}%`;

/** A packet that appears at the first point, follows the polyline at `speed` plan units per ms and vanishes at the end. */
export function packetKeyframes(
  name: string,
  points: Point[],
  speed: number,
): Keyframes {
  const lengths = points
    .slice(1)
    .map(([x, y], i) => Math.hypot(x - points[i]![0], y - points[i]![1]));
  const total = lengths.reduce((sum, n) => sum + n, 0) || 1;
  const last = points.at(-1) ?? [0, 0];
  const travelled = lengths.map((_, i) =>
    lengths.slice(0, i + 1).reduce((sum, n) => sum + n, 0),
  );
  const frames = points.map(([x, y], i) => {
    const progress = i === 0 ? 0 : travelled[i - 1]! / total;
    return `${percent(progress * 0.995)} { opacity: 1; transform: translate(${round(x)}px, ${round(y)}px); }`;
  });
  const end = `100% { opacity: 0; transform: translate(${round(last[0])}px, ${round(last[1])}px); }`;
  return {
    name,
    duration: Math.round(total / speed),
    css: `@keyframes ${name} { ${[...new Set(frames)].join(" ")} ${end} }`,
  };
}

/** Steps a value through `stops` (0–1 progress, any CSS declarations), for scrubbing a crosshair or tooltip. */
export function stepKeyframes(
  name: string,
  stops: { at: number; style: string }[],
  duration: number,
): Keyframes {
  return {
    name,
    duration,
    css: `@keyframes ${name} { ${stops.map(({ at, style }) => `${percent(at)} { ${style} }`).join(" ")} }`,
  };
}

/**
 * Inline style that plays generated keyframes once, starting `at` ms into the run. The name goes through
 * --illustration-play, which reduced motion sets to none, since an inline animation outranks the stylesheet.
 */
export const play = (
  { name, duration }: Keyframes,
  at: number,
  easing = "linear",
): CSSProperties => ({
  animation: `var(--illustration-play, ${name}) ${round(duration)}ms ${easing} ${startAt(at)}`,
});
