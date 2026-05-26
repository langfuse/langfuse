import { describe, expect, it } from "vitest";

import { type FilterState } from "@langfuse/shared";

import { __test } from "./MonitorsTable";

const { filterStateToListMonitorFilter } = __test;

describe("filterStateToListMonitorFilter", () => {
  it("passes severity `any of` through with values intact", () => {
    const state: FilterState = [
      {
        type: "stringOptions",
        column: "severity",
        operator: "any of",
        value: ["ALERT", "WARNING"],
      },
    ];
    expect(filterStateToListMonitorFilter(state)).toEqual([
      {
        type: "stringOptions",
        column: "severity",
        operator: "any of",
        value: ["ALERT", "WARNING"],
      },
    ]);
  });

  it("expands NO_DATA to (NO_DATA, UNKNOWN) on the severity column", () => {
    const state: FilterState = [
      {
        type: "stringOptions",
        column: "severity",
        operator: "any of",
        value: ["NO_DATA"],
      },
    ];
    expect(filterStateToListMonitorFilter(state)).toEqual([
      {
        type: "stringOptions",
        column: "severity",
        operator: "any of",
        value: ["NO_DATA", "UNKNOWN"],
      },
    ]);
  });

  it("expands NO_DATA on `none of` too", () => {
    const state: FilterState = [
      {
        type: "stringOptions",
        column: "severity",
        operator: "none of",
        value: ["NO_DATA"],
      },
    ];
    expect(filterStateToListMonitorFilter(state)).toEqual([
      {
        type: "stringOptions",
        column: "severity",
        operator: "none of",
        value: ["NO_DATA", "UNKNOWN"],
      },
    ]);
  });

  it("does not duplicate UNKNOWN when both NO_DATA and UNKNOWN are already present", () => {
    const state: FilterState = [
      {
        type: "stringOptions",
        column: "severity",
        operator: "any of",
        value: ["NO_DATA", "UNKNOWN", "ALERT"],
      },
    ];
    expect(filterStateToListMonitorFilter(state)).toEqual([
      {
        type: "stringOptions",
        column: "severity",
        operator: "any of",
        value: ["NO_DATA", "UNKNOWN", "ALERT"],
      },
    ]);
  });

  it("passes tags rows through unchanged", () => {
    const state: FilterState = [
      {
        type: "arrayOptions",
        column: "tags",
        operator: "any of",
        value: ["prod"],
      },
    ];
    expect(filterStateToListMonitorFilter(state)).toEqual(state);
  });

  it("collapses to no filter when a row has an unrecognized column", () => {
    const state: FilterState = [
      {
        type: "stringOptions",
        column: "bogus",
        operator: "any of",
        value: ["x"],
      },
      {
        type: "arrayOptions",
        column: "tags",
        operator: "any of",
        value: ["prod"],
      },
    ];
    expect(filterStateToListMonitorFilter(state)).toEqual([]);
  });

  it("collapses to no filter when a column is duplicated", () => {
    const state: FilterState = [
      {
        type: "stringOptions",
        column: "severity",
        operator: "any of",
        value: ["ALERT"],
      },
      {
        type: "stringOptions",
        column: "severity",
        operator: "none of",
        value: ["PAUSED"],
      },
    ];
    expect(filterStateToListMonitorFilter(state)).toEqual([]);
  });
});
