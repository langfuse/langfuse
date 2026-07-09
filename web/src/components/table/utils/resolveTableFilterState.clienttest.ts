import { describe, expect, it } from "vitest";
import { type FilterState } from "@langfuse/shared";
import { resolveTableFilterState } from "./resolveTableFilterState";

const dateRangeFilter: FilterState = [
  {
    column: "startTime",
    type: "datetime",
    operator: ">=",
    value: new Date("2026-07-08T00:00:00.000Z"),
  },
];

const externalFilterState: FilterState = [
  {
    column: "type",
    type: "stringOptions",
    operator: "any of",
    value: ["GENERATION"],
  },
];

const combinedFilterState: FilterState = [
  {
    column: "name",
    type: "string",
    operator: "=",
    value: "my-observation",
  },
  ...dateRangeFilter,
];

describe("resolveTableFilterState", () => {
  it("keeps the date-range filter when external filters are provided", () => {
    // Regression: external filters (eval preview) used to replace the whole
    // combined filter state including the date range, producing unbounded
    // full-history ClickHouse queries.
    const result = resolveTableFilterState({
      externalFilterState,
      dateRangeFilter,
      combinedFilterState,
    });

    expect(result).toEqual([...externalFilterState, ...dateRangeFilter]);
  });

  it("keeps external filters with an empty date-range filter", () => {
    const result = resolveTableFilterState({
      externalFilterState,
      dateRangeFilter: [],
      combinedFilterState,
    });

    expect(result).toEqual(externalFilterState);
  });

  it("returns the combined filter state when no external filters are provided", () => {
    const result = resolveTableFilterState({
      externalFilterState: undefined,
      dateRangeFilter,
      combinedFilterState,
    });

    expect(result).toEqual(combinedFilterState);
  });
});
