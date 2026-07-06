import { describe, expect, it } from "vitest";

import {
  groupDataByTimeDimension,
  type TimeSeriesGroupedRow,
} from "@/src/features/widgets/chart-library/utils";
import { prepareDenseSeries } from "@/src/features/widgets/chart-library/prepareDenseSeries";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";

const point = (
  time: string,
  dimension: string | undefined,
  metric: number | null,
): DataPoint => ({ time_dimension: time, dimension, metric });

const rows = (data: DataPoint[]): TimeSeriesGroupedRow[] =>
  groupDataByTimeDimension(data);

describe("prepareDenseSeries", () => {
  it("fills missing series cells with 0 for additive (zero) semantics", () => {
    // gpt-4 has no row on day 2 — a count of zero events, not unknown data.
    const grouped = rows([
      point("2026-07-01", "gpt-4", 5),
      point("2026-07-01", "gpt-3.5", 2),
      point("2026-07-02", "gpt-3.5", 3),
      point("2026-07-03", "gpt-4", 7),
      point("2026-07-03", "gpt-3.5", 1),
    ]);

    const dense = prepareDenseSeries(grouped, ["gpt-4", "gpt-3.5"], "zero");

    expect(dense).toEqual([
      { time_dimension: "2026-07-01", "gpt-4": 5, "gpt-3.5": 2 },
      { time_dimension: "2026-07-02", "gpt-4": 0, "gpt-3.5": 3 },
      { time_dimension: "2026-07-03", "gpt-4": 7, "gpt-3.5": 1 },
    ]);
  });

  it("fills missing series cells with null for non-additive (gap) semantics", () => {
    // No honest average exists for a bucket without data — the line must gap.
    const grouped = rows([
      point("2026-07-01", "gpt-4", 120),
      point("2026-07-03", "gpt-4", 180),
    ]);

    const dense = prepareDenseSeries(grouped, ["gpt-4"], "gap");

    expect(dense).toEqual([
      { time_dimension: "2026-07-01", "gpt-4": 120 },
      { time_dimension: "2026-07-03", "gpt-4": 180 },
    ]);
  });

  it("keeps buckets that exist only as empty markers, so the axis shows the gap", () => {
    // A WITH FILL marker row (no dimension, no metric) proves the bucket exists;
    // it must stay on the axis with every series filled by its semantics.
    const grouped = rows([
      point("2026-07-01", "gpt-4", 5),
      point("2026-07-02", undefined, null),
      point("2026-07-03", "gpt-4", 7),
    ]);

    expect(prepareDenseSeries(grouped, ["gpt-4"], "zero")).toEqual([
      { time_dimension: "2026-07-01", "gpt-4": 5 },
      { time_dimension: "2026-07-02", "gpt-4": 0 },
      { time_dimension: "2026-07-03", "gpt-4": 7 },
    ]);

    expect(prepareDenseSeries(grouped, ["gpt-4"], "gap")).toEqual([
      { time_dimension: "2026-07-01", "gpt-4": 5 },
      { time_dimension: "2026-07-02", "gpt-4": null },
      { time_dimension: "2026-07-03", "gpt-4": 7 },
    ]);
  });

  it("preserves real 0 and null values instead of re-deciding them", () => {
    const grouped = rows([
      point("2026-07-01", "gpt-4", 0),
      point("2026-07-02", "gpt-4", null),
    ]);

    expect(prepareDenseSeries(grouped, ["gpt-4"], "zero")).toEqual([
      { time_dimension: "2026-07-01", "gpt-4": 0 },
      { time_dimension: "2026-07-02", "gpt-4": null },
    ]);
  });

  it("does not mutate the input rows", () => {
    const grouped = rows([
      point("2026-07-01", "gpt-4", 5),
      point("2026-07-02", "gpt-3.5", 3),
    ]);
    const snapshot = JSON.parse(JSON.stringify(grouped));

    prepareDenseSeries(grouped, ["gpt-4", "gpt-3.5"], "zero");

    expect(grouped).toEqual(snapshot);
  });
});

describe("groupDataByTimeDimension with bucket markers", () => {
  it("keeps a marker point's time bucket without inventing an 'Unknown' series", () => {
    const grouped = rows([
      point("2026-07-01", "gpt-4", 5),
      point("2026-07-02", undefined, null),
    ]);

    expect(grouped).toEqual([
      { time_dimension: "2026-07-01", "gpt-4": 5 },
      { time_dimension: "2026-07-02" },
    ]);
  });
});
