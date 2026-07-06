import { describe, expect, it } from "vitest";
import { type FilterState } from "@langfuse/shared";
import { getSessionFilterOptionsStartTimeFilters } from "./sessionFilterOptions";

describe("getSessionFilterOptionsStartTimeFilters", () => {
  const minTimestamp = new Date("2026-06-01T00:00:00.000Z");
  const maxTimestamp = new Date("2026-06-02T00:00:00.000Z");

  it("uses the session time range when no explicit startTime filter exists", () => {
    expect(
      getSessionFilterOptionsStartTimeFilters({
        filterState: [],
        minTimestamp,
        maxTimestamp,
      }),
    ).toEqual([
      {
        column: "startTime",
        type: "datetime",
        operator: ">=",
        value: minTimestamp,
      },
      {
        column: "startTime",
        type: "datetime",
        operator: "<=",
        value: maxTimestamp,
      },
    ]);
  });

  it("uses explicit startTime filters when they include a lower bound", () => {
    const explicitFilters: FilterState = [
      {
        column: "Start Time",
        type: "datetime",
        operator: ">=",
        value: new Date("2026-05-01T00:00:00.000Z"),
      },
      {
        column: "Start Time",
        type: "datetime",
        operator: "<=",
        value: new Date("2026-05-03T00:00:00.000Z"),
      },
    ];

    expect(
      getSessionFilterOptionsStartTimeFilters({
        filterState: explicitFilters,
        minTimestamp,
        maxTimestamp,
      }),
    ).toEqual(explicitFilters);
  });

  it("adds the session lower bound while preserving upper-only filters", () => {
    const upperBound = {
      column: "startTime" as const,
      type: "datetime" as const,
      operator: "<=" as const,
      value: new Date("2026-05-03T00:00:00.000Z"),
    };

    expect(
      getSessionFilterOptionsStartTimeFilters({
        filterState: [upperBound],
        minTimestamp,
        maxTimestamp,
      }),
    ).toEqual([
      {
        column: "startTime",
        type: "datetime",
        operator: ">=",
        value: minTimestamp,
      },
      upperBound,
    ]);
  });
});
