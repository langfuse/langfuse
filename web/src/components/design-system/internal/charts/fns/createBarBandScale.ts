/* eslint-disable check-file/folder-naming-convention -- Internal chart functions live in the requested fns directory. */
import { scaleBand } from "d3-scale";

export function createBarBandScale(
  count: number,
  left: number,
  width: number,
  spacing: "default" | "histogram",
) {
  return scaleBand<number>()
    .domain(Array.from({ length: count }, (_, index) => index))
    .range([left, left + width])
    .paddingInner(spacing === "histogram" ? 0 : 0.2)
    .paddingOuter(spacing === "histogram" ? 0 : 0.1);
}
