import type { FilterState } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import { getFilterAnalyticsProperties } from "./getFilterAnalyticsProperties";

describe("getFilterAnalyticsProperties", () => {
  it("reports filter columns without filter values", () => {
    const filters = [
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["GENERATION"],
      },
      {
        column: "type",
        type: "stringOptions",
        operator: "none of",
        value: ["SPAN"],
      },
      {
        column: "metadata",
        key: "customerId",
        type: "stringObject",
        operator: "=",
        value: "private-customer-id",
      },
    ] satisfies FilterState;

    expect(getFilterAnalyticsProperties(filters)).toEqual({
      filterCount: 3,
      filterColumns: ["type", "metadata"],
      usesExperimentFilter: false,
    });
  });

  it.each([
    "experimentId",
    "experimentName",
    "experimentDatasetId",
    "isExperimentItemRootSpan",
  ])("identifies the %s experiment filter", (column) => {
    const filters = [
      {
        column,
        type: "string",
        operator: "=",
        value: "value",
      },
    ] satisfies FilterState;

    expect(getFilterAnalyticsProperties(filters)).toEqual({
      filterCount: 1,
      filterColumns: [column],
      usesExperimentFilter: true,
    });
  });
});
