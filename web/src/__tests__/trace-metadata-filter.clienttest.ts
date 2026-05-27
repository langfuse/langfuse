import { decodeFiltersGeneric } from "@/src/features/filters/lib/filter-query-encoding";
import {
  addTraceMetadataFilter,
  buildNewTracesTablePathWithMetadataFilter,
  getTraceMetadataFilterKeyFromPath,
  getTraceMetadataFilterKeyFromRowId,
  getTraceMetadataFilterValue,
} from "@/src/components/trace/lib/trace-metadata-filter";
import { type FilterState } from "@langfuse/shared";

describe("trace metadata filter helpers", () => {
  it("uses string values without JSON quoting", () => {
    expect(getTraceMetadataFilterValue("production")).toBe("production");
  });

  it("serializes non-string metadata values for stringObject filters", () => {
    expect(getTraceMetadataFilterValue(42)).toBe("42");
    expect(getTraceMetadataFilterValue(true)).toBe("true");
    expect(getTraceMetadataFilterValue({ tier: "enterprise" })).toBe(
      '{"tier":"enterprise"}',
    );
  });

  it("builds dot-path metadata keys from formatted and advanced JSON rows", () => {
    expect(getTraceMetadataFilterKeyFromRowId("customer-region-code")).toBe(
      "customer.region.code",
    );
    expect(
      getTraceMetadataFilterKeyFromPath(["metadata", "customer", "plan"]),
    ).toBe("customer.plan");
  });

  it("adds metadata filters without duplicating an identical filter", () => {
    const existingFilters: FilterState = [
      {
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: ["production"],
      },
      {
        column: "metadata",
        type: "stringObject",
        key: "customerId",
        operator: "=",
        value: "acme",
      },
    ];

    const result = addTraceMetadataFilter(existingFilters, {
      key: "customerId",
      value: "acme",
    });

    expect(result).toHaveLength(2);
    expect(result.at(-1)).toEqual({
      column: "metadata",
      type: "stringObject",
      key: "customerId",
      operator: "=",
      value: "acme",
    });
  });

  it("builds a new traces table URL, closes peek params, and keeps existing filters", () => {
    const result = buildNewTracesTablePathWithMetadataFilter({
      currentPath:
        "/project/project-1/traces?dateRange=last7d&peek=obs-1&observation=obs-1&traceId=trace-1&timestamp=2026-03-08T18%3A27%3A00.703Z&page=4&limit=100",
      projectId: "project-1",
      filters: [
        {
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["production"],
        },
      ],
      request: {
        key: "customerId",
        value: "acme",
      },
    });

    const url = new URL(result, "https://langfuse.local");

    expect(url.pathname).toBe("/project/project-1/traces");
    expect(url.searchParams.get("dateRange")).toBe("last7d");
    expect(url.searchParams.get("limit")).toBe("100");
    expect(url.searchParams.get("peek")).toBeNull();
    expect(url.searchParams.get("observation")).toBeNull();
    expect(url.searchParams.get("traceId")).toBeNull();
    expect(url.searchParams.get("timestamp")).toBeNull();
    expect(url.searchParams.get("page")).toBeNull();

    expect(decodeFiltersGeneric(url.searchParams.get("filter") ?? "")).toEqual([
      {
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: ["production"],
      },
      {
        column: "metadata",
        type: "stringObject",
        key: "customerId",
        operator: "=",
        value: "acme",
      },
    ]);
  });
});
