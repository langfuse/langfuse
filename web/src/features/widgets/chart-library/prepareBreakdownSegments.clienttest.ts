import { describe, expect, it } from "vitest";
import { prepareBreakdownSegments } from "@/src/features/widgets/chart-library/prepareBreakdownSegments";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";

const point = (
  time: string | undefined,
  dimension: string | undefined,
  metric: DataPoint["metric"],
): DataPoint => ({ time_dimension: time, dimension, metric });

/** One bucket of a cost breakdown, totalled the way cost_details is. */
const costBucket = (time: string, components: Record<string, number>) => [
  point(
    time,
    "total",
    Object.values(components).reduce((sum, value) => sum + value, 0),
  ),
  ...Object.entries(components).map(([key, value]) => point(time, key, value)),
];

const dimensionsOf = (data: DataPoint[]) => data.map((d) => d.dimension);

describe("prepareBreakdownSegments", () => {
  it("drops the aggregate so a stacked bucket sums to the real total", () => {
    const data = costBucket("2026-10-08", { input: 0.28, output: 10.65 });
    const segments = prepareBreakdownSegments(data, "total");

    expect(dimensionsOf(segments)).toEqual(["input", "output"]);
    expect(
      segments.reduce((sum, d) => sum + (d.metric as number), 0),
    ).toBeCloseTo(10.93);
  });

  it("keeps a bucket whose only member is the aggregate", () => {
    // A cost provided at ingestion has no per-key breakdown: dropping its one
    // member would erase the bucket instead of correcting it.
    const data = [point("2026-10-08", "total", 89.79)];

    expect(prepareBreakdownSegments(data, "total")).toBe(data);
  });

  it("decides per bucket in a series that mixes both shapes", () => {
    const data = [
      ...costBucket("2026-10-08", { input: 1, output: 3 }),
      point("2026-10-09", "total", 7),
    ];

    expect(prepareBreakdownSegments(data, "total")).toEqual([
      point("2026-10-08", "input", 1),
      point("2026-10-08", "output", 3),
      point("2026-10-09", "total", 7),
    ]);
  });

  it("keeps the aggregate when no component in its bucket has a value", () => {
    const data = [
      point("2026-10-08", "total", 5),
      point("2026-10-08", "input", null),
    ];

    expect(prepareBreakdownSegments(data, "total")).toBe(data);
  });

  it("leaves standing the part of the aggregate its components do not explain", () => {
    // One observation priced per key, one whose cost arrived already totalled
    // (`provided_cost_details: { total: 7 }`). The aggregate row sums both, so
    // dropping it would erase that 7 from a bucket that really cost 11.
    const data = [
      point("2026-10-08", "total", 11),
      point("2026-10-08", "input", 1),
      point("2026-10-08", "output", 3),
    ];
    const segments = prepareBreakdownSegments(data, "total");

    expect(segments).toEqual([
      point("2026-10-08", "total", 7),
      point("2026-10-08", "input", 1),
      point("2026-10-08", "output", 3),
    ]);
    expect(
      segments.reduce((sum, d) => sum + (d.metric as number), 0),
    ).toBeCloseTo(11);
  });

  it("drops an aggregate its components miss only by floating-point drift", () => {
    const components = { input: 0.28, output: 10.65, cache_read: 46.67 };
    const data = [
      point("2026-10-08", "total", 0.28 + 10.65 + 46.67 + Number.EPSILON * 32),
      ...Object.entries(components).map(([key, value]) =>
        point("2026-10-08", key, value),
      ),
    ];

    expect(dimensionsOf(prepareBreakdownSegments(data, "total"))).toEqual([
      "input",
      "output",
      "cache_read",
    ]);
  });

  it("drops an aggregate smaller than its components rather than drawing a negative segment", () => {
    const data = [
      point("2026-10-08", "total", 3),
      point("2026-10-08", "input", 4),
    ];

    expect(dimensionsOf(prepareBreakdownSegments(data, "total"))).toEqual([
      "input",
    ]);
  });

  it("keeps bucket markers, which carry an axis bucket rather than a segment", () => {
    const data = [
      ...costBucket("2026-10-08", { input: 1, output: 3 }),
      point("2026-10-09", undefined, null),
    ];

    expect(dimensionsOf(prepareBreakdownSegments(data, "total"))).toEqual([
      "input",
      "output",
      undefined,
    ]);
  });

  it("returns the input itself for a breakdown that declares no aggregate", () => {
    // A user breakdown may genuinely contain a category called "total"; it is
    // only an aggregate when its dimension says so.
    const data = costBucket("2026-10-08", { input: 1, output: 3 });

    expect(prepareBreakdownSegments(data, undefined)).toBe(data);
  });

  it("returns the input itself when the aggregate is absent", () => {
    const data = [
      point("2026-10-08", "input", 1),
      point("2026-10-08", "output", 3),
    ];

    expect(prepareBreakdownSegments(data, "total")).toBe(data);
  });

  it("drops the aggregate from a non-time-series breakdown", () => {
    // A pie has one implicit group: every point shares an undefined bucket.
    const data = [
      point(undefined, "total", 10),
      point(undefined, "input", 4),
      point(undefined, "output", 6),
    ];

    expect(dimensionsOf(prepareBreakdownSegments(data, "total"))).toEqual([
      "input",
      "output",
    ]);
  });

  it("treats a component measured as 0 as a real component", () => {
    const data = [
      point("2026-10-08", "total", 0),
      point("2026-10-08", "input", 0),
    ];

    expect(dimensionsOf(prepareBreakdownSegments(data, "total"))).toEqual([
      "input",
    ]);
  });

  it("rolls up the components a server-side top-N already truncated", () => {
    // A non-time-series v2 breakdown is a top-N query ordered by the metric, so
    // the aggregate — always the largest row — takes a slot and the smallest
    // components never arrive. What is left of it then stands for them, and the
    // pie still totals what the project really spent.
    const data = [point(undefined, "total", 10), point(undefined, "input", 6)];
    const segments = prepareBreakdownSegments(data, "total");

    expect(segments).toEqual([
      point(undefined, "total", 4),
      point(undefined, "input", 6),
    ]);
  });
});
