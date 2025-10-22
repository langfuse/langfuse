/**
 * Integration tests for filter query encoding/decoding through full URL lifecycle.
 * These tests verify the complete flow: FilterState → URL → FilterState
 * using browser URLSearchParams APIs to simulate real-world usage.
 */

import { type FilterState, tracesTableCols } from "@langfuse/shared";
import {
  encodeFiltersGeneric,
  decodeFiltersGeneric,
  type ColumnToQueryKeyMap,
  type GenericFilterOptions,
} from "./lib/filter-query-encoding";
import { validateFilters } from "@/src/components/table/table-view-presets/validation";

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
        value: "anyshift",
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
