// @vitest-environment node

import { describe, expect, it } from "vitest";
import { EXPERIMENTS_DEFAULTS, type ExperimentsContent } from "./content";
import { SCENE_FRAMES } from "../frames";
import { experimentsPlanPoints, layoutExperiments } from "./layout";

const layoutOf = (content: Partial<ExperimentsContent> = {}) =>
  layoutExperiments({ ...EXPERIMENTS_DEFAULTS, ...content });

describe("layoutExperiments", () => {
  it("reproduces experiments.png's frame and text for its defaults", () => {
    const layout = layoutOf();

    expect(layout.viewBox).toEqual(SCENE_FRAMES.experiments);
    expect(layout.series.map(({ label, hero }) => [label.text, hero])).toEqual([
      ["set A", true],
      ["set B", false],
    ]);
    expect(layout.run.slot.text).toBe("run-2026-11-17T14:34:24.799Z");

    // Both series start where the PNG's lines start, with their chips just above
    const [hero, other] = layout.series;
    expect(hero!.points[0]).toEqual([-76, 265.92]);
    expect(other!.points[0]![1]).toBeCloseTo(209.28, 1);
    // Chip centres within 2 units of the traced PNG
    expect(Math.abs(hero!.chip.y + 11.5 - 251.25)).toBeLessThan(2);
    expect(Math.abs(other!.chip.y + 11.5 - 191.9)).toBeLessThan(2);
  });

  it("hatches only the hero, down to the baseline", () => {
    const [hero, other] = layoutOf().series;

    expect(hero!.area).toMatch(/L220 384L-76 384Z$/);
    expect(other!.area).toBeUndefined();
  });

  it("draws seven guides on the grid, alternating solid and dashed, fading at the top", () => {
    const { guides } = layoutOf();

    expect(guides.map(({ v }) => v)).toEqual([
      192, 224, 256, 288, 320, 352, 384,
    ]);
    expect(guides.map(({ dashed }) => dashed)).toEqual([
      false,
      true,
      false,
      true,
      false,
      true,
      false,
    ]);
    expect(guides[0]!.opacity).toBeLessThan(guides[1]!.opacity);
    expect(guides.at(-1)!.opacity).toBe(1);
  });

  it("spreads plain numbers evenly and clamps values to the chart", () => {
    expect(experimentsPlanPoints([0, 0.5, 1])).toEqual([
      [-76, 384],
      [72, 288],
      [220, 192],
    ]);
    expect(experimentsPlanPoints([0.5])).toEqual([[-76, 288]]);
    expect(experimentsPlanPoints([[2, -1]])).toEqual([[220, 384]]);
  });

  it("moves the second chip above the hero's when the series start close together, below when there's no room", () => {
    const chipsFor = (heroStart: number, otherStart: number) =>
      layoutOf({
        series: [
          { label: "set A", points: [heroStart, 0.6] },
          { label: "set B", points: [otherStart, 0.4] },
        ],
      }).series.map(({ chip }) => chip.y);

    const [hero, above] = chipsFor(0.5, 0.52);
    expect(hero! - above!).toBeGreaterThanOrEqual(23);

    const [topHero, below] = chipsFor(1, 0.98);
    expect(below! - topHero!).toBeGreaterThanOrEqual(23);
  });

  it("scrubs the crosshair along the hero", () => {
    const layout = layoutOf();

    expect(layout.keyframes.map(({ name }) => name)).toEqual([
      "lfi-cross-dot",
      "lfi-cross-line",
    ]);
  });

  it("draws nothing, and no crosshair, for a series without points", () => {
    const layout = layoutOf({ series: [{ label: "empty", points: [] }] });

    expect(layout.series).toHaveLength(0);
    expect(layout.crosshair).toHaveLength(0);
  });
});
