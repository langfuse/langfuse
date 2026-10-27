// @vitest-environment node

import { type FilterState } from "@langfuse/shared";
import { canApplyOutlierStripFilters } from "./filterCompatibility";

describe("canApplyOutlierStripFilters", () => {
  it("accepts chart-compatible filters and the represented time range", () => {
    const filters: FilterState = [
      { column: "environment", type: "string", operator: "=", value: "prod" },
      {
        column: "startTime",
        type: "datetime",
        operator: ">=",
        value: new Date("2025-01-01T00:00:00.000Z"),
      },
    ];

    expect(canApplyOutlierStripFilters(filters, false)).toBe(true);
  });

  it("stays available under a keyed metadata filter", () => {
    const filters: FilterState = [
      {
        column: "metadata",
        type: "stringObject",
        key: "langfuse_user_email",
        operator: "does not contain",
        value: "@langfuse.com",
      },
    ];

    expect(canApplyOutlierStripFilters(filters, false)).toBe(true);
  });

  it("rejects filters the aggregate query cannot represent", () => {
    const unsupportedFilters: FilterState[] = [
      [{ column: "latency", type: "number", operator: ">", value: 2 }],
      [
        {
          column: "name",
          type: "null",
          operator: "is not null",
          value: "",
        },
      ],
    ];

    for (const filters of unsupportedFilters) {
      expect(canApplyOutlierStripFilters(filters, false)).toBe(false);
    }
  });

  it("rejects active free-text search", () => {
    expect(canApplyOutlierStripFilters([], true)).toBe(false);
  });
});
