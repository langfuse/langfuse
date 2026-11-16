// @vitest-environment node

import { describe, expect, it } from "vitest";
import { prepareBigNumber } from "./prepareBigNumber";
import { type DataPoint } from "./chart-props";

const point = (metric: DataPoint["metric"]): DataPoint => ({
  metric,
  dimension: undefined,
  time_dimension: undefined,
});

describe("prepareBigNumber", () => {
  it("uses strict warning/critical boundaries in both directions and keeps missing values neutral", () => {
    const higher = {
      direction: "higher-is-better" as const,
      warning: 0.75,
      critical: 0.6,
    };
    const lower = {
      direction: "lower-is-better" as const,
      warning: 0.75,
      critical: 0.9,
    };

    for (const [metric, thresholds, label, color] of [
      [0.8, higher, "Healthy", "green"],
      [0.75, higher, "Healthy", "green"],
      [0.67, higher, "Warning", "amber"],
      [0.6, higher, "Warning", "amber"],
      [0.59, higher, "Critical", "red"],
      [0, higher, "Critical", "red"],
      [0.7, lower, "Healthy", "green"],
      [0.75, lower, "Healthy", "green"],
      [0.8, lower, "Warning", "amber"],
      [0.9, lower, "Warning", "amber"],
      [0.91, lower, "Critical", "red"],
    ] as const) {
      expect.soft(prepareBigNumber([point(metric)], thresholds)).toEqual({
        value: metric,
        status: { label, color },
      });
    }

    for (const metric of [null, Number.NaN, Infinity, -Infinity]) {
      expect.soft(prepareBigNumber([point(metric)], higher)).toBeNull();
    }
    expect.soft(prepareBigNumber([], higher)).toBeNull();
    expect
      .soft(prepareBigNumber([point(0)]))
      .toEqual({ value: 0, status: null });
    expect
      .soft(prepareBigNumber([point(0.4), point(0.4)], higher))
      .toEqual({ value: 0.8, status: { label: "Healthy", color: "green" } });
    expect
      .soft(prepareBigNumber([point(0.8)], { ...higher, critical: 0.9 }))
      .toEqual({ value: 0.8, status: null });
  });
});
