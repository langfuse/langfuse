import type { FilterState, OrderByState } from "@langfuse/shared";
import {
  sanitizeFirstObservationInTraceFilters,
  sanitizeFirstObservationInTraceOrderBy,
  sanitizeFirstObservationInTraceSearchType,
} from "./firstObservationInTrace";

describe("first observation in trace helpers", () => {
  const firstObservationFilter: FilterState[number] = {
    column: "firstObservationInTrace",
    type: "boolean",
    operator: "=",
    value: true,
  };

  it("keeps filters unchanged when 1st observation mode is inactive", () => {
    const filters: FilterState = [
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["GENERATION"],
      },
      {
        column: "scores_avg",
        type: "numberObject",
        key: "accuracy",
        operator: ">=",
        value: 0.9,
      },
    ];

    expect(
      sanitizeFirstObservationInTraceFilters(filters, { hasTimeRange: true }),
    ).toEqual(filters);
  });

  it("removes incompatible filters when 1st observation mode is active", () => {
    const filters: FilterState = [
      firstObservationFilter,
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["GENERATION"],
      },
      {
        column: "scores_avg",
        type: "numberObject",
        key: "accuracy",
        operator: ">=",
        value: 0.9,
      },
      {
        column: "commentContent",
        type: "string",
        operator: "contains",
        value: "oops",
      },
    ];

    expect(
      sanitizeFirstObservationInTraceFilters(filters, { hasTimeRange: true }),
    ).toEqual([
      firstObservationFilter,
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["GENERATION"],
      },
    ]);
  });

  it("drops the 1st observation filter when no time range exists", () => {
    const filters: FilterState = [
      firstObservationFilter,
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["GENERATION"],
      },
    ];

    expect(
      sanitizeFirstObservationInTraceFilters(filters, { hasTimeRange: false }),
    ).toEqual([
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["GENERATION"],
      },
    ]);
  });

  it("strips content search while 1st observation mode is active", () => {
    expect(
      sanitizeFirstObservationInTraceSearchType(["id", "content"], true),
    ).toEqual(["id"]);
    expect(
      sanitizeFirstObservationInTraceSearchType(["content"], true),
    ).toEqual(["id"]);
  });

  it("resets unsupported order by columns to start time", () => {
    const orderBy: OrderByState = {
      column: "scores_avg",
      order: "ASC",
    };

    expect(sanitizeFirstObservationInTraceOrderBy(orderBy, true)).toEqual({
      column: "startTime",
      order: "DESC",
    });
  });
});
