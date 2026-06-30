import { describe, expect, it } from "vitest";
import { type FilterState } from "@langfuse/shared";
import { type QueryType } from "@langfuse/shared/query";
import { decodeFiltersGeneric } from "@/src/features/filters/lib/filter-query-encoding";
import { buildV4TracesChartDrilldownPath } from "@/src/features/events/lib/chartDrilldownPaths";

const PROJECT_ID = "project-1";
const FROM = "2024-01-01T00:00:00.000Z";
const TO = "2024-01-01T03:00:00.000Z";

const query = (overrides: Partial<QueryType> = {}): QueryType => ({
  view: "observations",
  dimensions: [],
  metrics: [{ measure: "count", aggregation: "count" }],
  filters: [],
  timeDimension: null,
  entityDimension: null,
  fromTimestamp: FROM,
  toTimestamp: TO,
  orderBy: null,
  chartConfig: { type: "LINE_TIME_SERIES" },
  ...overrides,
});

const urlOf = (path: string) => new URL(path, "https://langfuse.local");

const filtersOf = (path: string): FilterState =>
  decodeFiltersGeneric(urlOf(path).searchParams.get("filter") ?? "");

const dateRangeOf = (path: string): { from: Date; to: Date } => {
  const encoded = urlOf(path).searchParams.get("dateRange");
  expect(encoded).toBeTruthy();
  const [from, to] = encoded!.split("-").map((value) => Number(value));
  return { from: new Date(from!), to: new Date(to!) };
};

describe("buildV4TracesChartDrilldownPath", () => {
  it("maps base filters, clicked time bucket, and clicked series to v4 traces params", () => {
    const path = buildV4TracesChartDrilldownPath({
      projectId: PROJECT_ID,
      query: query({
        dimensions: [{ field: "name" }],
        filters: [
          {
            column: "tags",
            type: "arrayOptions",
            operator: "any of",
            value: ["prod"],
          },
        ],
        timeDimension: { granularity: "auto" },
      }),
      mark: {
        type: "timeSeries",
        bucketStart: "2024-01-01T01:00:00.000Z",
        dimension: { field: "name", value: "checkout" },
      },
    });

    expect(path).not.toBeNull();
    expect(urlOf(path!).pathname).toBe("/project/project-1/traces");
    expect(dateRangeOf(path!)).toEqual({
      from: new Date("2024-01-01T01:00:00.000Z"),
      to: new Date("2024-01-01T01:59:59.999Z"),
    });
    expect(filtersOf(path!)).toEqual([
      {
        column: "traceTags",
        type: "arrayOptions",
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

  it("maps trace id dimensions to the v4 traceId column", () => {
    const path = buildV4TracesChartDrilldownPath({
      projectId: PROJECT_ID,
      query: query({ view: "traces" }),
      mark: { type: "dimension", field: "id", value: "trace-123" },
    });

    expect(filtersOf(path!)).toEqual([
      {
        column: "traceId",
        type: "string",
        operator: "=",
        value: "trace-123",
      },
    ]);
  });

  it("omits drilldowns when a base filter cannot be represented on the v4 table", () => {
    const path = buildV4TracesChartDrilldownPath({
      projectId: PROJECT_ID,
      query: query({
        filters: [
          {
            column: "release",
            type: "string",
            operator: "=",
            value: "2024.01",
          },
        ],
      }),
      mark: { type: "base" },
    });

    expect(path).toBeNull();
  });

  it("keeps null and empty string dimension values distinct", () => {
    const nullPath = buildV4TracesChartDrilldownPath({
      projectId: PROJECT_ID,
      query: query(),
      mark: { type: "dimension", field: "name", value: null },
    });
    const emptyPath = buildV4TracesChartDrilldownPath({
      projectId: PROJECT_ID,
      query: query(),
      mark: { type: "dimension", field: "name", value: "" },
    });

    expect(filtersOf(nullPath!)).toEqual([
      { column: "name", type: "null", operator: "is null", value: "" },
    ]);
    expect(filtersOf(emptyPath!)).toEqual([
      {
        column: "name",
        type: "stringOptions",
        operator: "any of",
        value: [""],
      },
    ]);
  });

  it("uses arrayOptions for exploded array dimensions", () => {
    const path = buildV4TracesChartDrilldownPath({
      projectId: PROJECT_ID,
      query: query(),
      mark: { type: "dimension", field: "tags", value: "customer" },
    });

    expect(filtersOf(path!)).toEqual([
      {
        column: "traceTags",
        type: "arrayOptions",
        operator: "any of",
        value: ["customer"],
      },
    ]);
  });

  it("converts histogram latency bins from widget milliseconds to v4 seconds", () => {
    const path = buildV4TracesChartDrilldownPath({
      projectId: PROJECT_ID,
      query: query(),
      mark: {
        type: "histogramBin",
        measure: "latency",
        lower: 1000,
        upper: 2500,
        isLastBin: true,
      },
    });

    expect(filtersOf(path!)).toEqual([
      { column: "latency", type: "number", operator: ">=", value: 1 },
      { column: "latency", type: "number", operator: "<=", value: 2.5 },
    ]);
  });
});
