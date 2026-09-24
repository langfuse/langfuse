/* eslint-disable check-file/folder-naming-convention -- Internal chart functions live in the requested fns directory. */
import { scaleLinear } from "d3-scale";
import { describe, expect, it } from "vitest";

import {
  getLinearAxisTicks,
  getSpacedLinearAxisTicks,
  spaceYAxisTicks,
} from "./getLinearAxisTicks";

describe("getLinearAxisTicks", () => {
  it("caps d3's overshoot on a padded zero domain so a short strip can label it", () => {
    // The experiments metric strip is ~64px of plot. Every run at $0 pads the
    // domain to [-1, 1]; ticks(3) still emits five labels that collide there.
    const scale = scaleLinear().domain([-1, 1]).nice(3);
    expect(scale.ticks(3)).toEqual([-1, -0.5, 0, 0.5, 1]);
    expect(getLinearAxisTicks(scale, 3)).toEqual([-1, 0, 1]);
  });

  it("keeps an already-short nice set", () => {
    const scale = scaleLinear().domain([0, 1]).nice(3);
    expect(getLinearAxisTicks(scale, 3)).toEqual([0, 0.5, 1]);
  });
});

describe("spaceYAxisTicks", () => {
  it("drops interiors closer than the label gap and keeps the endpoints", () => {
    const y = (value: number) => value * 10;
    expect(spaceYAxisTicks([0, 1, 2, 3, 4], y, 18)).toEqual([0, 2, 4]);
  });
});

describe("getSpacedLinearAxisTicks", () => {
  it("returns three readable labels for the short zero-cost strip", () => {
    const scale = scaleLinear().domain([-1, 1]).nice(3).range([64, 0]);
    expect(getSpacedLinearAxisTicks(scale, 3)).toEqual([-1, 0, 1]);
  });
});
