// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  METRICS_DEFAULTS,
  METRICS_LIMITS,
  type MetricsContent,
} from "./content";
import { SCENE_FRAMES } from "../frames";
import { layoutMetrics } from "./layout";

const layoutOf = (content: Partial<MetricsContent> = {}) =>
  layoutMetrics({ ...METRICS_DEFAULTS, ...content });

const pointsOf = (line: string) =>
  line
    .split(/[ML]/)
    .filter(Boolean)
    .map((pair) => pair.split(" ").map(Number));

describe("layoutMetrics", () => {
  it("reproduces metrics.png's frame, values and crosshair for its defaults", () => {
    const layout = layoutOf();

    expect(layout.viewBox).toEqual(SCENE_FRAMES.metrics);
    expect(layout.tooltip.date.text).toBe("2026/2/9");
    expect(`${layout.tooltip.value.text} ${layout.tooltip.unit}`).toBe(
      "218 traces",
    );
    expect(layout.dates.map(({ slot }) => slot.text)).toEqual([
      "30/8",
      "3/9",
      "7/9",
    ]);

    // The crosshair rests on the marked point, with the flag to its right
    expect(layout.marker.u).toBeCloseTo(-18.6, 0);
    expect(layout.marker.v).toBeCloseTo(389.4, 0);
    expect(layout.marker.flip).toBe(false);
    expect(layout.tooltip.chip.x).toBeGreaterThan(layout.marker.u);
  });

  it("flips the flag left of the crosshair near the end of the axis", () => {
    const layout = layoutOf({
      points: [0.2, 0.4, 0.6, 0.8],
      positions: undefined,
      marker: { ...METRICS_DEFAULTS.marker, index: 3 },
    });

    expect(layout.marker.flip).toBe(true);
    expect(layout.tooltip.chip.x + layout.tooltip.chip.width).toBeLessThan(
      layout.marker.u,
    );
  });

  it("shortens dates on a crowded axis so neighbours never overlap", () => {
    const layout = layoutOf({
      dates: Array.from({ length: 5 }, () => "2026-09-30T12:00Z"),
    });
    const [first, second] = layout.dates;

    expect([...first!.slot.text].length).toBeLessThan(METRICS_LIMITS.date);
    // Dates are right-aligned: the first ends before the second begins
    expect(first!.x).toBeLessThan(
      second!.x - [...second!.slot.text].length * 9.9,
    );
    expect(first!.slot.full).toBe("2026-09-30T12:00Z");
  });

  it("clamps values to the chart and the marker to the last point", () => {
    const layout = layoutOf({
      points: Array.from({ length: 40 }, (_, i) => (i % 2 ? 1.5 : -1)),
      positions: undefined,
      dates: Array.from({ length: 8 }, (_, i) => `${i + 1}/9`),
      marker: { ...METRICS_DEFAULTS.marker, index: 99 },
    });
    const vs = pointsOf(layout.line).map(([, v]) => v!);

    expect(Math.min(...vs)).toBe(layout.chart.top);
    expect(Math.max(...vs)).toBe(layout.chart.baseline);
    expect(layout.marker.v).toBe(vs.at(-1));
  });

  it("spaces points evenly when positions are missing or a different length", () => {
    const us = pointsOf(
      layoutOf({ points: [0, 1, 0], positions: [0, 0.1] }).line,
    ).map(([u]) => u!);

    expect(us[1]! - us[0]!).toBeCloseTo(us[2]! - us[1]!, 1);
  });
});
