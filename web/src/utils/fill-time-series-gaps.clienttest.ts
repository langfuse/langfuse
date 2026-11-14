// @vitest-environment node

process.env.TZ = "UTC";

import { describe, expect, it } from "vitest";
import { fillTimeSeriesGaps } from "./fill-time-series-gaps";

describe("fillTimeSeriesGaps - numeric weighted aggregation (#20232)", () => {
  it("weights a multi-day mean by the number of scores", () => {
    const data = [
      {
        timestamp: new Date("2026-10-31T00:00:00.000Z"),
        avg1: 0,
        avg2: null,
        count: 10,
      },
      {
        timestamp: new Date("2026-11-01T00:00:00.000Z"),
        avg1: 1,
        avg2: null,
        count: 90,
      },
    ];

    const points = fillTimeSeriesGaps(
      data,
      new Date("2026-10-04T00:00:00.000Z"),
      new Date("2026-11-03T00:00:00.000Z"),
      { count: 2, unit: "day" },
    ).filter((point) => point.avg1 !== null);

    expect(points).toHaveLength(1);
    expect(points[0]!.avg1).toBeCloseTo(0.9);
    expect(points[0]!.count).toBe(100);
  });

  it("weights independent series means by their respective counts (two-series mode)", () => {
    const data = [
      {
        timestamp: new Date("2026-10-31T00:00:00.000Z"),
        avg1: 0,
        avg2: 0,
        count: 100,
        count1: 10,
        count2: 90,
      },
      {
        timestamp: new Date("2026-11-01T00:00:00.000Z"),
        avg1: 1,
        avg2: 1,
        count: 100,
        count1: 90,
        count2: 10,
      },
    ];

    const points = fillTimeSeriesGaps(
      data,
      new Date("2026-10-04T00:00:00.000Z"),
      new Date("2026-11-03T00:00:00.000Z"),
      { count: 2, unit: "day" },
    ).filter((point) => point.avg1 !== null);

    expect(points).toHaveLength(1);
    expect(points[0]!.avg1).toBeCloseTo(0.9);
    expect(points[0]!.avg2).toBeCloseTo(0.1);
    expect(points[0]!.count1).toBe(100);
    expect(points[0]!.count2).toBe(100);
    expect(points[0]!.count).toBe(200);
  });

  it("preserves arithmetic mean when volumes are equal", () => {
    const data = [
      {
        timestamp: new Date("2026-10-31T00:00:00.000Z"),
        avg1: 0,
        avg2: null,
        count: 50,
      },
      {
        timestamp: new Date("2026-11-01T00:00:00.000Z"),
        avg1: 1,
        avg2: null,
        count: 50,
      },
    ];

    const points = fillTimeSeriesGaps(
      data,
      new Date("2026-10-04T00:00:00.000Z"),
      new Date("2026-11-03T00:00:00.000Z"),
      { count: 2, unit: "day" },
    ).filter((point) => point.avg1 !== null);

    expect(points).toHaveLength(1);
    expect(points[0]!.avg1).toBeCloseTo(0.5);
    expect(points[0]!.count).toBe(100);
  });

  it("handles missing/null values in one series while weighting the other", () => {
    const data = [
      {
        timestamp: new Date("2026-10-31T00:00:00.000Z"),
        avg1: 0.4,
        avg2: null,
        count: 10,
        count1: 10,
        count2: null,
      },
      {
        timestamp: new Date("2026-11-01T00:00:00.000Z"),
        avg1: null,
        avg2: 0.8,
        count: 50,
        count1: null,
        count2: 50,
      },
    ];

    const points = fillTimeSeriesGaps(
      data,
      new Date("2026-10-04T00:00:00.000Z"),
      new Date("2026-11-03T00:00:00.000Z"),
      { count: 2, unit: "day" },
    );

    const validPoint = points.find((p) => p.avg1 !== null || p.avg2 !== null);
    expect(validPoint).toBeDefined();
    expect(validPoint!.avg1).toBeCloseTo(0.4);
    expect(validPoint!.avg2).toBeCloseTo(0.8);
    expect(validPoint!.count).toBe(60);
    expect(validPoint!.count1).toBe(10);
    expect(validPoint!.count2).toBe(50);
  });

  it("falls back to unweighted mean when all weights are zero", () => {
    const data = [
      {
        timestamp: new Date("2026-10-31T00:00:00.000Z"),
        avg1: 2,
        count: 0,
      },
      {
        timestamp: new Date("2026-11-01T00:00:00.000Z"),
        avg1: 4,
        count: 0,
      },
    ];

    const points = fillTimeSeriesGaps(
      data,
      new Date("2026-10-04T00:00:00.000Z"),
      new Date("2026-11-03T00:00:00.000Z"),
      { count: 2, unit: "day" },
    ).filter((p) => p.avg1 !== null);

    expect(points).toHaveLength(1);
    expect(points[0]!.avg1).toBe(3);
    expect(points[0]!.count).toBe(0);
  });

  it("falls back to unweighted mean for arbitrary data without count fields", () => {
    const data = [
      {
        timestamp: new Date("2026-10-31T00:00:00.000Z"),
        score: 10,
      },
      {
        timestamp: new Date("2026-11-01T00:00:00.000Z"),
        score: 20,
      },
    ];

    const points = fillTimeSeriesGaps(
      data,
      new Date("2026-10-04T00:00:00.000Z"),
      new Date("2026-11-03T00:00:00.000Z"),
      { count: 2, unit: "day" },
    ).filter((p) => (p as any).score !== null);

    expect(points).toHaveLength(1);
    expect((points[0] as any).score).toBe(15);
  });

  it("correctly fills gaps in single-unit intervals without modifying data points", () => {
    const data = [
      {
        timestamp: new Date("2026-10-31T00:00:00.000Z"),
        avg1: 0.25,
        count: 10,
      },
      {
        timestamp: new Date("2026-11-02T00:00:00.000Z"),
        avg1: 0.75,
        count: 20,
      },
    ];

    const points = fillTimeSeriesGaps(
      data,
      new Date("2026-10-31T00:00:00.000Z"),
      new Date("2026-11-02T00:00:00.000Z"),
      { count: 1, unit: "day" },
    );

    expect(points).toHaveLength(3);
    expect(points[0]!.avg1).toBe(0.25);
    expect(points[0]!.count).toBe(10);
    // Gap day
    expect(points[1]!.avg1).toBeNull();
    expect(points[1]!.count).toBeNull();
    // Third day
    expect(points[2]!.avg1).toBe(0.75);
    expect(points[2]!.count).toBe(20);
  });
});
