/**
 * Integration tests for filter query encoding/decoding through full URL lifecycle.
 * These tests verify the complete flow: FilterState → URL → FilterState
 * using browser URLSearchParams APIs to simulate real-world usage.
 */

import {
  type FilterState,
  tracesTableCols,
  observationsTableCols,
} from "@langfuse/shared";
import {
  encodeFiltersGeneric,
  decodeFiltersGeneric,
  type ColumnToQueryKeyMap,
  type GenericFilterOptions,
} from "./lib/filter-query-encoding";
import { validateFilters } from "@/src/components/table/table-view-presets/validation";
import { traceFilterConfig } from "./config/traces-config";
import { observationFilterConfig } from "./config/observations-config";
import { transformFiltersForBackend } from "./lib/filter-transform";
import { sessionFilterConfig } from "./config/sessions-config";

const mockColumnMap: ColumnToQueryKeyMap = {
  name: "name",
  period: "period",
  diet: "diet",
  length: "length",
  extinct: "extinct",
  ratings: "ratings",
  scoresNumeric: "scoresNumeric",
  metadata: "metadata",
};

const mockOptions: GenericFilterOptions = {
  period: ["triassic", "jurassic", "cretaceous"],
  diet: ["carnivore", "herbivore", "omnivore"],
};

// Helper to simulate complete URL flow
function simulateUrlFlow(filters: FilterState): FilterState {
  // encode filters to query string
  const encoded = encodeFiltersGeneric(filters, mockColumnMap, mockOptions);

  // mock browser URL API
  const params = new URLSearchParams();
  params.set("filter", encoded);
  const urlString = params.toString();

  // mock reading from URL like on page load
  const readParams = new URLSearchParams(urlString);
  const queryValue = readParams.get("filter") || "";

  // decode to filter state
  return decodeFiltersGeneric(queryValue, mockColumnMap, mockOptions);
}

describe("Filter Query Encoding Integration (Full URL Lifecycle)", () => {
  it("should handle all filter types through complete URL flow", () => {
    const filters: FilterState = [
      // string
      {
        column: "name",
        type: "string",
        operator: "contains",
        value: "tyrannosaurus rex",
      },
      // number with >= and <=
      {
        column: "length",
        type: "number",
        operator: ">=",
        value: 5,
      },
      {
        column: "length",
        type: "number",
        operator: "<=",
        value: 10,
      },
      // boolean with =
      {
        column: "extinct",
        type: "boolean",
        operator: "=",
        value: true,
      },
      // stringOptions (any of)
      {
        column: "period",
        type: "stringOptions",
        operator: "any of",
        value: ["triassic", "jurassic"],
      },
      // stringOptions (none of)
      {
        column: "diet",
        type: "stringOptions",
        operator: "none of",
        value: ["carnivore"],
      },
      // numberObject
      {
        column: "scoresNumeric",
        type: "numberObject",
        operator: ">=",
        key: "accuracy",
        value: 0.8,
      },
      // stringObject
      {
        column: "metadata",
        type: "stringObject",
        operator: "contains",
        key: "environment",
        value: "production",
      },
      // categoryOptions
      {
        column: "ratings",
        type: "categoryOptions",
        operator: "any of",
        key: "danger",
        value: ["high", "medium"],
      },
    ];

    const result = simulateUrlFlow(filters);
    expect(result).toEqual(filters);
  });

  it("should handle backwards compatibility with legacy URL-encoded operators", () => {
    // Verify legacy bookmarked URLs with %3E%3D (>=), %3C%3D (<=), %3D (=) still work
    const legacyUrl =
      "filter=length;number;;%3E%3D;5,length;number;;%3C%3D;10,extinct;boolean;;%3D;true";
    const params = new URLSearchParams(legacyUrl);
    const decoded = decodeFiltersGeneric(
      params.get("filter") || "",
      mockColumnMap,
      mockOptions,
    );

    expect(decoded).toEqual([
      {
        column: "length",
        type: "number",
        operator: ">=",
        value: 5,
      },
      {
        column: "length",
        type: "number",
        operator: "<=",
        value: 10,
      },
      {
        column: "extinct",
        type: "boolean",
        operator: "=",
        value: true,
      },
    ]);
  });

  it("should handle URL-unsafe characters and edge cases", () => {
    const edgeCases: Array<{ filters: FilterState; description: string }> = [
      {
        description: "special characters in values",
        filters: [
          {
            column: "name",
            type: "string",
            operator: "contains",
            value: "T-Rex (Tyrannosaurus) & Friends!",
          },
        ],
      },
      {
        description: "unicode characters",
        filters: [
          {
            column: "name",
            type: "string",
            operator: "contains",
            value: "🦖 T-Rex 恐竜 恐龙",
          },
        ],
      },
      {
        description: "percent characters",
        filters: [
          {
            column: "name",
            type: "string",
            operator: "contains",
            value: "50%",
          },
        ],
      },
      {
        description: "empty string value",
        filters: [
          {
            column: "name",
            type: "string",
            operator: "contains",
            value: "",
          },
        ],
      },
      {
        description: "pipe characters in array values",
        filters: [
          {
            column: "period",
            type: "stringOptions",
            operator: "any of",
            value: ["triassic", "jurassic"],
          },
        ],
      },
      {
        description: "operators with URL-unsafe chars (>=, <=)",
        filters: [
          {
            column: "length",
            type: "number",
            operator: ">=",
            value: 5,
          },
          {
            column: "length",
            type: "number",
            operator: "<=",
            value: 10,
          },
        ],
      },
    ];

    edgeCases.forEach(({ filters }) => {
      const result = simulateUrlFlow(filters);
      expect(result).toEqual(filters);
    });

    // Empty filters
    expect(simulateUrlFlow([])).toEqual([]);
  });
});

describe("Saved View Validation (Backward & Forward Compatibility)", () => {
  /**
   * Integration tests simulating the full save/restore flow.
   * These test what happens when:
   * 1. Old saved views (no env/timestamp) are loaded → should work
   * 2. New saved views (with env/timestamp) are saved → should be preserved
   * 3. New saved views (with env/timestamp) are loaded → should work
   */

  it("should restore old saved view without environment or timestamp filters", () => {
    // Simulate loading an old saved view from database
    const oldSavedView: FilterState = [
      {
        column: "name",
        type: "stringOptions",
        operator: "any of",
        value: ["test"],
      },
      { column: "latency", type: "number", operator: ">=", value: 1.5 },
    ];

    // This is what useTableViewManager does: validates then applies
    const validated = validateFilters(oldSavedView, tracesTableCols);

    // Should pass through unchanged - no env/timestamp to validate
    expect(validated).toEqual(oldSavedView);
    expect(validated).toHaveLength(2);
  });

  it("should save new view with environment filter and restore it correctly", () => {
    // User creates filter state with environment (now possible in new UI)
    const newFilterState: FilterState = [
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
        value: ["test"],
      },
    ];

    // 1. SAVE: Component saves this to database (no transformation)
    const savedToDB = newFilterState; // Stored as-is in JSON column

    // 2. RESTORE: Later, load from database and validate
    const validated = validateFilters(savedToDB, tracesTableCols);

    // Should restore with environment filter intact
    expect(validated).toEqual(newFilterState);
    expect(validated).toHaveLength(2);
    expect(validated[0]?.column).toBe("environment"); // ✅ Environment preserved
  });

  it("should save new view with timestamp filter and restore it correctly", () => {
    // User sets date range, which creates timestamp filters
    const newFilterState: FilterState = [
      {
        column: "timestamp",
        type: "datetime",
        operator: ">=",
        value: new Date("2024-01-01"),
      },
      {
        column: "timestamp",
        type: "datetime",
        operator: "<=",
        value: new Date("2024-12-31"),
      },
      {
        column: "name",
        type: "stringOptions",
        operator: "any of",
        value: ["test"],
      },
    ];

    // SAVE → RESTORE cycle
    const validated = validateFilters(newFilterState, tracesTableCols);

    // Should restore with timestamp filters intact
    expect(validated).toEqual(newFilterState);
    expect(validated).toHaveLength(3);
    expect(validated[0]?.column).toBe("timestamp"); // ✅ Timestamp preserved
  });

  it("should demonstrate BUG: restore fails with filtered column definitions", () => {
    // This simulates the CURRENT BUG in traces.tsx:1131
    // where transformedFilterOptions filters out environment/timestamp
    const filteredCols = tracesTableCols.filter(
      (c) => c.id !== "environment" && c.id !== "timestamp",
    );

    // Load a view with environment filter (valid in new system)
    const savedView: FilterState = [
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
        value: ["test"],
      },
    ];

    // Validate with FILTERED columns (what traces.tsx currently does)
    const validated = validateFilters(savedView, filteredCols);

    // BUG: environment filter incorrectly removed during restore!
    expect(validated).toHaveLength(1); // ❌ Lost environment filter
    expect(validated[0]?.column).toBe("name");
    // This would show error toast: "Outdated view - Some filters were ignored"
  });

  it("should remove truly invalid columns but keep valid ones", () => {
    // View has both valid and invalid columns
    const mixedView: FilterState = [
      {
        column: "deletedColumn",
        type: "string",
        operator: "contains",
        value: "x",
      },
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
        value: ["test"],
      },
    ];

    const validated = validateFilters(mixedView, tracesTableCols);

    // Should remove deletedColumn, keep environment and name
    expect(validated).toHaveLength(2);
    expect(validated.map((f) => f.column)).toEqual(["environment", "name"]);
  });

  it("should normalize old display names to column IDs", () => {
    // Old saved views used display names like "User ID" instead of "userId"
    const oldViewWithDisplayNames: FilterState = [
      {
        column: "User ID",
        type: "string",
        operator: "contains",
        value: "test-user",
      },
      {
        column: "name",
        type: "stringOptions",
        operator: "any of",
        value: ["test-trace"],
      },
    ];

    const validated = validateFilters(oldViewWithDisplayNames, tracesTableCols);

    // Should normalize "User ID" to "userId", keep "name" as-is
    expect(validated).toHaveLength(2);
    expect(validated[0]?.column).toBe("userId"); // Normalized!
    expect(validated[1]?.column).toBe("name"); // Already correct
  });

  it("should handle old saved view metadata filter with column name metadata key", () => {
    const savedFilter: FilterState = [
      {
        key: "projectName",
        type: "stringObject",
        value: "myproject",
        column: "Metadata", // Display name (capital M)
        operator: "contains",
      },
    ];

    // 1. Validate: normalizes "Metadata" → "metadata"
    const validated = validateFilters(savedFilter, tracesTableCols);
    expect(validated).toHaveLength(1);
    expect(validated[0]?.column).toBe("metadata"); // Normalized to lowercase ID

    // 2. Encode: should find "metadata" in columnToQueryKey
    const encoded = encodeFiltersGeneric(
      validated,
      {
        metadata: "metadata",
        name: "name",
        userId: "userId",
      },
      {},
    );

    // Should successfully encode (not drop the filter!)
    expect(encoded).toBeTruthy();
    expect(encoded).toContain(
      "metadata;stringObject;projectName;contains;myproject",
    );

    // 3. Decode: should restore correctly
    const decoded = decodeFiltersGeneric(
      encoded,
      {
        metadata: "metadata",
        name: "name",
        userId: "userId",
      },
      {},
    );

    expect(decoded).toHaveLength(1);
    expect(decoded[0]).toEqual({
      column: "metadata",
      type: "stringObject",
      key: "projectName",
      operator: "contains",
      value: "myproject",
    });
  });

  it("should handle saved score filters with display names", () => {
    // Real saved filters for scores
    const savedFilters: FilterState = [
      {
        key: "hallucination",
        type: "categoryOptions",
        value: ["high"],
        column: "Scores (categorical)", // Display name
        operator: "any of",
      },
      {
        key: "accuracy",
        type: "numberObject",
        value: 0.8,
        column: "Scores (numeric)", // Display name
        operator: ">=",
      },
    ];

    // 1. Validate: normalizes display names → IDs
    const validated = validateFilters(savedFilters, tracesTableCols);
    expect(validated).toHaveLength(2);
    expect(validated[0]?.column).toBe("score_categories");
    expect(validated[1]?.column).toBe("scores_avg");

    // 2. Encode: should find column IDs in columnToQueryKey
    const encoded = encodeFiltersGeneric(
      validated,
      {
        score_categories: "score_categories",
        scores_avg: "scores_avg",
      },
      {},
    );

    expect(encoded).toBeTruthy();
    expect(encoded).toContain(
      "score_categories;categoryOptions;hallucination;any of;high",
    );
    expect(encoded).toContain("scores_avg;numberObject;accuracy");

    // 3. Round-trip: decode should restore
    const decoded = decodeFiltersGeneric(
      encoded,
      {
        score_categories: "score_categories",
        scores_avg: "scores_avg",
      },
      {},
    );

    expect(decoded).toHaveLength(2);
    expect(decoded[0]?.column).toBe("score_categories");
    expect(decoded[1]?.column).toBe("scores_avg");
  });
});

describe("Config Validation of old saved views", () => {
  it("should validate traces config uses column IDs not display names", () => {
    // Validate all keys in columnToQueryKey exist as column IDs
    const columnIds = new Set(tracesTableCols.map((col) => col.id));
    const invalidKeys = Object.keys(traceFilterConfig.columnToQueryKey).filter(
      (key) => !columnIds.has(key),
    );

    expect(invalidKeys).toEqual([]);

    // Validate all facet columns exist as column IDs
    const invalidFacets = traceFilterConfig.facets.filter(
      (facet) => !columnIds.has(facet.column),
    );

    expect(invalidFacets).toEqual([]);
  });

  it("should validate observations config uses column IDs not display names", () => {
    const columnIds = new Set(observationsTableCols.map((col) => col.id));
    const invalidKeys = Object.keys(
      observationFilterConfig.columnToQueryKey,
    ).filter((key) => !columnIds.has(key));

    expect(invalidKeys).toEqual([]);

    const invalidFacets = observationFilterConfig.facets.filter(
      (facet) => !columnIds.has(facet.column),
    );

    expect(invalidFacets).toEqual([]);
  });
});

describe("transformFiltersForBackend - Deduplication", () => {
  it("should preserve multiple string contains filters", () => {
    // URL has environment contains "e" AND environment contains "a"
    // filter=environment;string;;contains;e,environment;string;;contains;a
    // These create valid SQL: WHERE env LIKE '%e%' AND env LIKE '%a%'

    const filterQuery =
      "environment;string;;contains;e,environment;string;;contains;a";

    const decoded = decodeFiltersGeneric(
      filterQuery,
      { environment: "environment" },
      {},
    );

    // Should decode to 2 filters
    expect(decoded).toHaveLength(2);

    const transformed = transformFiltersForBackend(
      decoded,
      {}, // No backend remapping
      sessionFilterConfig.columnDefinitions,
    );

    // Should still have both filters after transformation
    expect(transformed).toHaveLength(2);
    expect(transformed[0]).toMatchObject({
      column: "environment",
      type: "string",
      operator: "contains",
      value: "e",
    });
    expect(transformed[1]).toMatchObject({
      column: "environment",
      type: "string",
      operator: "contains",
      value: "a",
    });
  });

  it("should deduplicate conflicting environment filters (bug fix)", () => {
    // This is the exact bug from sessions table:
    // Old saved view has "Environment" (display name), user clicks new filter with "environment" (ID)
    const duplicateFilters: FilterState = [
      {
        column: "Environment", // Old display name from saved view
        type: "stringOptions",
        operator: "any of",
        value: ["production"],
      },
      {
        column: "environment", // New filter from user clicking sidebar
        type: "stringOptions",
        operator: "any of",
        value: ["local"],
      },
    ];

    const result = transformFiltersForBackend(
      duplicateFilters,
      {}, // No backend remapping needed
      sessionFilterConfig.columnDefinitions,
    );

    // Should only keep the LAST filter (most recent user selection)
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      column: "environment", // Normalized to ID
      type: "stringOptions",
      operator: "any of",
      value: ["local"], // Keeps last value
    });
  });

  it("should keep multiple numeric filters for ranges", () => {
    // Numeric filters with different operators should not be deduplicated
    const rangeFilters: FilterState = [
      {
        column: "totalCost",
        type: "number",
        operator: ">=",
        value: 5,
      },
      {
        column: "totalCost",
        type: "number",
        operator: "<=",
        value: 10,
      },
    ];

    const result = transformFiltersForBackend(
      rangeFilters,
      {},
      sessionFilterConfig.columnDefinitions,
    );

    // Both should be kept (valid range: WHERE cost >= 5 AND cost <= 10)
    expect(result).toHaveLength(2);
    expect(result[0]?.operator).toBe(">=");
    expect(result[1]?.operator).toBe("<=");
  });

  it("should keep multiple datetime filters for date ranges", () => {
    const dateFilters: FilterState = [
      {
        column: "createdAt",
        type: "datetime",
        operator: ">=",
        value: new Date("2024-01-01"),
      },
      {
        column: "createdAt",
        type: "datetime",
        operator: "<=",
        value: new Date("2024-12-31"),
      },
    ];

    const result = transformFiltersForBackend(
      dateFilters,
      {},
      sessionFilterConfig.columnDefinitions,
    );

    // Both should be kept
    expect(result).toHaveLength(2);
  });

  it("should normalize column names before deduplication", () => {
    // Mix of display names and IDs should be normalized then deduplicated
    // because here, 2 filters would just result in nothing
    const mixedFilters: FilterState = [
      {
        column: "Environment", // Display name
        type: "stringOptions",
        operator: "any of",
        value: ["prod"],
      },
      {
        column: "User IDs", // Display name (maps to "userIds" ID)
        type: "arrayOptions",
        operator: "any of",
        value: ["user1"],
      },
      {
        column: "environment", // ID (same as first after normalization)
        type: "stringOptions",
        operator: "any of",
        value: ["staging"],
      },
    ];

    const result = transformFiltersForBackend(
      mixedFilters,
      {},
      sessionFilterConfig.columnDefinitions,
    );

    // Should have 2 filters: userIds and environment
    expect(result).toHaveLength(2);
    expect(result[0]?.column).toBe("userIds");
    expect(result[1]?.column).toBe("environment"); // Last occurrence kept
    expect(result[1]?.value).toEqual(["staging"]); // Most recent value
  });

  it("should handle backend column remapping after deduplication", () => {
    // Traces table: "tags" (frontend) → "traceTags" (backend)
    const filters: FilterState = [
      {
        column: "tags",
        type: "arrayOptions",
        operator: "any of",
        value: ["tag1"],
      },
    ];

    const result = transformFiltersForBackend(
      filters,
      { tags: "traceTags" }, // Backend remapping
      traceFilterConfig.columnDefinitions,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.column).toBe("traceTags"); // Remapped to backend name
  });
});
