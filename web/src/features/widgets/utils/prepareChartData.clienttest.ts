import { describe, expect, it } from "vitest";
import { type QueryType } from "@langfuse/shared/query";
import { decodeFiltersGeneric } from "@/src/features/filters/lib/filter-query-encoding";
import { serializePivotDrilldownDimensions } from "@/src/features/events/lib/chartDrilldownPaths";
import { prepareWidgetChartData } from "@/src/features/widgets/utils/prepareChartData";

const PROJECT_ID = "project-1";

const query = (overrides: Partial<QueryType> = {}): QueryType => ({
  view: "observations",
  dimensions: [],
  metrics: [{ measure: "count", aggregation: "count" }],
  filters: [],
  timeDimension: null,
  entityDimension: null,
  fromTimestamp: "2024-01-01T00:00:00.000Z",
  toTimestamp: "2024-01-01T03:00:00.000Z",
  orderBy: null,
  chartConfig: { type: "LINE_TIME_SERIES" },
  ...overrides,
});

const filtersOf = (href: string) =>
  decodeFiltersGeneric(
    new URL(href, "https://langfuse.local").searchParams.get("filter") ?? "",
  );

describe("prepareWidgetChartData", () => {
  it("attaches time-series bucket and series drilldowns", () => {
    const data = prepareWidgetChartData({
      rows: [
        {
          time_dimension: "2024-01-01T01:00:00.000Z",
          name: "checkout",
          count_count: 5,
        },
      ],
      projectId: PROJECT_ID,
      query: query({
        dimensions: [{ field: "name" }],
        timeDimension: { granularity: "auto" },
      }),
      chartType: "LINE_TIME_SERIES",
      metrics: [{ measure: "count", agg: "count" }],
      dimensions: [{ field: "name" }],
      isV4Enabled: true,
    });

    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      time_dimension: "2024-01-01T01:00:00.000Z",
      dimension: "checkout",
      metric: 5,
    });
    expect(filtersOf(data[0]!.drilldown!.href)).toEqual([
      {
        column: "name",
        type: "stringOptions",
        operator: "any of",
        value: ["checkout"],
      },
    ]);
  });

  it("does not expose drilldowns when v4 is disabled", () => {
    const data = prepareWidgetChartData({
      rows: [{ name: "checkout", count_count: 5 }],
      projectId: PROJECT_ID,
      query: query({ dimensions: [{ field: "name" }] }),
      chartType: "HORIZONTAL_BAR",
      metrics: [{ measure: "count", agg: "count" }],
      dimensions: [{ field: "name" }],
      isV4Enabled: false,
    });

    expect(data[0]?.drilldown).toBeUndefined();
  });

  it("attaches dimension drilldowns to breakdown charts", () => {
    const data = prepareWidgetChartData({
      rows: [{ tags: "customer", count_count: 3 }],
      projectId: PROJECT_ID,
      query: query({ dimensions: [{ field: "tags" }] }),
      chartType: "HORIZONTAL_BAR",
      metrics: [{ measure: "count", agg: "count" }],
      dimensions: [{ field: "tags" }],
      isV4Enabled: true,
    });

    expect(data[0]).toMatchObject({
      time_dimension: undefined,
      dimension: "customer",
      metric: 3,
    });
    expect(filtersOf(data[0]!.drilldown!.href)).toEqual([
      {
        column: "traceTags",
        type: "arrayOptions",
        operator: "any of",
        value: ["customer"],
      },
    ]);
  });

  it("attaches histogram bin drilldowns and keeps the base number drilldown", () => {
    const data = prepareWidgetChartData({
      rows: [
        {
          histogram_latency: [
            [0, 1000, 2],
            [1000, 2000, 1],
          ],
        },
      ],
      projectId: PROJECT_ID,
      query: query(),
      chartType: "HISTOGRAM",
      metrics: [{ measure: "latency", agg: "histogram" }],
      dimensions: [],
      isV4Enabled: true,
    });

    expect(data[0]?.drilldown?.href).toContain("/project/project-1/traces?");
    expect(data[0]?.histogramBinDrilldowns).toHaveLength(2);
    expect(filtersOf(data[0]!.histogramBinDrilldowns![1]!.href)).toEqual([
      { column: "latency", type: "number", operator: ">=", value: 1 },
      { column: "latency", type: "number", operator: "<=", value: 2 },
    ]);
  });

  it("attaches base drilldowns to big number charts", () => {
    const data = prepareWidgetChartData({
      rows: [{ count_count: 42 }],
      projectId: PROJECT_ID,
      query: query(),
      chartType: "NUMBER",
      metrics: [{ measure: "count", agg: "count" }],
      dimensions: [],
      isV4Enabled: true,
    });

    expect(data[0]).toMatchObject({ metric: 42 });
    expect(data[0]?.drilldown?.href).toContain("/project/project-1/traces?");
    expect(filtersOf(data[0]!.drilldown!.href)).toEqual([]);
  });

  it("prepares pivot drilldowns for totals, subtotals, and leaf rows", () => {
    const data = prepareWidgetChartData({
      rows: [
        { environment: "prod", name: "checkout", count_count: 4 },
        { environment: "staging", name: "checkout", count_count: 1 },
      ],
      projectId: PROJECT_ID,
      query: query({
        dimensions: [{ field: "environment" }, { field: "name" }],
      }),
      chartType: "PIVOT_TABLE",
      metrics: [{ measure: "count", agg: "count" }],
      dimensions: [{ field: "environment" }, { field: "name" }],
      isV4Enabled: true,
    });

    const lookup = data[0]?.pivotDrilldownByDimensions;
    expect(lookup).toBeDefined();

    const total = lookup![serializePivotDrilldownDimensions({})];
    const subtotal =
      lookup![serializePivotDrilldownDimensions({ environment: "prod" })];
    const leaf =
      lookup![
        serializePivotDrilldownDimensions({
          environment: "prod",
          name: "checkout",
        })
      ];

    expect(filtersOf(total!.href)).toEqual([]);
    expect(filtersOf(subtotal!.href)).toEqual([
      {
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: ["prod"],
      },
    ]);
    expect(filtersOf(leaf!.href)).toEqual([
      {
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: ["prod"],
      },
      {
        column: "name",
        type: "stringOptions",
        operator: "any of",
        value: ["checkout"],
      },
    ]);
  });
});
