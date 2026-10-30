import { describe, expect, it } from "vitest";
import type { FilterState } from "@langfuse/shared";
import { query as querySchema, validateQuery } from "@langfuse/shared/query";

import { GATEWAY_ANALYTICS_WIDGETS } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/constants/gatewayAnalyticsWidgets";
import { buildGatewayAnalyticsQuery } from "./buildGatewayAnalyticsQuery";

const timeRange = {
  from: new Date("2026-01-01T00:00:00.000Z"),
  to: new Date("2026-01-31T00:00:00.000Z"),
};

const noFilters: FilterState = [];

const widget = (id: string) => {
  const found = GATEWAY_ANALYTICS_WIDGETS.find((w) => w.id === id);
  if (!found) throw new Error(`Unknown widget ${id}`);
  return found;
};

describe("buildGatewayAnalyticsQuery", () => {
  it.each(GATEWAY_ANALYTICS_WIDGETS.map((w) => [w.id, w] as const))(
    "builds a valid v2 query scoped to gateway traffic for %s",
    (_id, w) => {
      const query = buildGatewayAnalyticsQuery(w, timeRange, noFilters);

      expect(w.chartConfig.type).toBe(w.chartType);
      expect(querySchema.safeParse(query).success).toBe(true);
      expect(validateQuery(query, "v2")).toEqual({ valid: true });
      expect(query.filters[0]).toEqual({
        column: "aiGatewayKeyId",
        operator: "is not null",
        value: "",
        type: "null",
      });
    },
  );

  it("ranks breakdowns by their first metric and caps the rows", () => {
    const query = buildGatewayAnalyticsQuery(
      widget("cost-by-api-key"),
      timeRange,
      noFilters,
    );

    expect(query.dimensions).toEqual([{ field: "aiGatewayKeyId" }]);
    expect(query.orderBy).toEqual([
      { field: "sum_totalCost", direction: "desc" },
    ]);
    expect(query.chartConfig?.row_limit).toBe(20);
    expect(query.timeDimension).toBeNull();
  });

  it("buckets time series automatically without ordering", () => {
    const query = buildGatewayAnalyticsQuery(
      widget("cost-over-time"),
      timeRange,
      noFilters,
    );

    expect(query.timeDimension).toEqual({ granularity: "auto" });
    expect(query.orderBy).toBeNull();
  });

  it("appends the header filters as valid v2 filters", () => {
    const filters: FilterState = [
      {
        column: "aiGatewayKeyOwnerUserId",
        operator: "any of",
        value: ["user-a", "user-b"],
        type: "stringOptions",
      },
      {
        column: "aiGatewayKeyId",
        operator: "any of",
        value: ["key-1"],
        type: "stringOptions",
      },
    ];
    const query = buildGatewayAnalyticsQuery(
      widget("cost-by-user"),
      timeRange,
      filters,
    );

    expect(validateQuery(query, "v2")).toEqual({ valid: true });
    expect(query.filters).toEqual(expect.arrayContaining(filters));
  });
});
