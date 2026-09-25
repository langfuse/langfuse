/* eslint-disable check-file/folder-naming-convention -- Internal chart functions live in the requested fns directory. */
import type { ScaleLinear } from "d3-scale";

/** 12px axis labels plus a 6px gap; interiors closer than this collide. */
export const Y_AXIS_LABEL_MIN_GAP = 18;

/**
 * d3's `ticks(count)` is a hint. On short plots it still emits more labels
 * than the count, which stack on top of each other. Cap that overshoot while
 * keeping the endpoints and the scale's own nice values.
 */
export function getLinearAxisTicks(
  scale: ScaleLinear<number, number>,
  maxCount: number,
): number[] {
  const ticks = scale.ticks(maxCount);
  if (maxCount < 2 || ticks.length <= maxCount) return ticks;

  const lastIndex = ticks.length - 1;
  const step = Math.ceil(lastIndex / (maxCount - 1));
  const picked: number[] = [];
  for (let index = 0; index < lastIndex; index += step) {
    const tick = ticks[index];
    if (tick !== undefined) picked.push(tick);
  }
  const last = ticks[lastIndex];
  if (last !== undefined && picked[picked.length - 1] !== last) {
    picked.push(last);
  }
  return picked;
}

/**
 * Drop interior ticks whose pixel positions sit closer than `minGap`, keeping
 * the endpoints so the domain stays labeled.
 */
export function spaceYAxisTicks(
  ticks: number[],
  y: (value: number) => number,
  minGap = Y_AXIS_LABEL_MIN_GAP,
): number[] {
  if (ticks.length <= 2) return ticks;

  const first = ticks[0];
  const last = ticks[ticks.length - 1];
  if (first === undefined || last === undefined) return ticks;

  const lastY = y(last);
  const spaced = [first];
  for (const tick of ticks.slice(1, -1)) {
    const previous = spaced[spaced.length - 1];
    if (previous === undefined) continue;
    if (
      Math.abs(y(tick) - y(previous)) >= minGap &&
      Math.abs(y(tick) - lastY) >= minGap
    ) {
      spaced.push(tick);
    }
  }
  spaced.push(last);
  return spaced;
}

export function getSpacedLinearAxisTicks(
  scale: ScaleLinear<number, number>,
  maxCount: number,
  minGap = Y_AXIS_LABEL_MIN_GAP,
): number[] {
  return spaceYAxisTicks(
    getLinearAxisTicks(scale, maxCount),
    (value) => scale(value),
    minGap,
  );
}
