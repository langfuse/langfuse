/**
 * Integration tests for filter query encoding/decoding through full URL lifecycle.
 * These tests verify the complete flow: FilterState → URL → FilterState
 * using browser URLSearchParams APIs to simulate real-world usage.
 */

import {
  type FilterState,
  type ColumnDefinition,
  tracesTableCols,
  observationsTableCols,
} from "@langfuse/shared";
import {
  encodeFiltersGeneric,
  decodeFiltersGeneric,
} from "./lib/filter-query-encoding";
import { validateFilters } from "@/src/components/table/table-view-presets/validation";
import { traceFilterConfig } from "./config/traces-config";
import { observationFilterConfig } from "./config/observations-config";
import { transformFiltersForBackend } from "./lib/filter-transform";
import { sessionFilterConfig } from "./config/sessions-config";
import { observationEventsFilterConfig } from "@/src/features/events/config/filter-config";
import {
  decodeAndNormalizeFilters,
  resolveCheckboxOperator,
} from "./hooks/useSidebarFilterState";
import {
  SESSION_DETAIL_SYSTEM_PRESETS,
  getSessionDetailPresetToApply,
} from "@/src/components/session/session-detail-presets";
import {
  buildManagedEnvironmentPolicyConfig,
  buildImplicitEnvironmentFilter,
  buildEffectiveEnvironmentFilter,
  stripImplicitEnvironmentFilterFromExplicitState,
} from "./lib/managedEnvironmentPolicy";
import { DEFAULT_SIDEBAR_HIDDEN_ENVIRONMENTS } from "./constants/internal-environments";

// Helper to simulate complete URL flow
function simulateUrlFlow(filters: FilterState): FilterState {
  // encode filters to query string
  const encoded = encodeFiltersGeneric(filters);

  // mock browser URL API
  const params = new URLSearchParams();
  params.set("filter", encoded);
  const urlString = params.toString();

  // mock reading from URL like on page load
  const readParams = new URLSearchParams(urlString);
  const queryValue = readParams.get("filter") || "";

  // decode to filter state
  return decodeFiltersGeneric(queryValue);
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
    const decoded = decodeFiltersGeneric(params.get("filter") || "");

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
        description: "pipe as delimiter between array values",
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
        description: "literal pipe characters within values (issue #11757)",
        filters: [
          {
            column: "name",
            type: "stringOptions",
            operator: "any of",
            value: ["Builder | Short Research"],
          },
        ],
      },
      {
        description: "multiple values with literal pipes",
        filters: [
          {
            column: "name",
            type: "stringOptions",
            operator: "any of",
            value: ["Builder | Short Research", "Another | Value"],
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

  it("should round-trip arrayOptions with empty value as [] not ['']", () => {
    // When user clicks ALL toggle with no checkboxes, value is []
    const filters: FilterState = [
      {
        column: "tags",
        type: "arrayOptions",
        operator: "all of",
        value: [],
      },
    ];

    const result = simulateUrlFlow(filters);

    // Must decode back to [] — not [""] which causes hasAll(tags, ['']) → 0 results
    expect(result).toEqual(filters);
    expect(result[0]?.value).toEqual([]);
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

    // "name" is normalized to "traceName" via alias
    expect(validated).toHaveLength(2);
    expect(validated[0]?.column).toBe("traceName");
    expect(validated[1]?.column).toBe("latency");
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

    // Should restore with environment filter intact, "name" normalized to "traceName"
    expect(validated).toHaveLength(2);
    expect(validated[0]?.column).toBe("environment"); // ✅ Environment preserved
    expect(validated[1]?.column).toBe("traceName"); // Normalized via alias
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

    // Should restore with timestamp filters intact, "name" normalized to "traceName"
    expect(validated).toHaveLength(3);
    expect(validated[0]?.column).toBe("timestamp"); // ✅ Timestamp preserved
    expect(validated[2]?.column).toBe("traceName"); // Normalized via alias
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
    expect(validated[0]?.column).toBe("traceName");
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

    // Should remove deletedColumn, keep environment and name (name normalized to traceName via alias)
    expect(validated).toHaveLength(2);
    expect(validated.map((f) => f.column)).toEqual([
      "environment",
      "traceName",
    ]);
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

    // Should normalize "User ID" to "userId", normalize "name" to "traceName" via alias
    expect(validated).toHaveLength(2);
    expect(validated[0]?.column).toBe("userId"); // Normalized!
    expect(validated[1]?.column).toBe("traceName"); // Normalized via alias!
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

    // 2. Encode
    const encoded = encodeFiltersGeneric(validated);

    // Should successfully encode (not drop the filter!)
    expect(encoded).toBeTruthy();
    expect(encoded).toContain(
      "metadata;stringObject;projectName;contains;myproject",
    );

    // 3. Decode: should restore correctly
    const decoded = decodeFiltersGeneric(encoded);

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

    // 2. Encode: should encode validated filters
    const encoded = encodeFiltersGeneric(validated);

    expect(encoded).toBeTruthy();
    expect(encoded).toContain(
      "score_categories;categoryOptions;hallucination;any of;high",
    );
    expect(encoded).toContain("scores_avg;numberObject;accuracy");

    // 3. Round-trip: decode should restore
    const decoded = decodeFiltersGeneric(encoded);

    expect(decoded).toHaveLength(2);
    expect(decoded[0]?.column).toBe("score_categories");
    expect(decoded[1]?.column).toBe("scores_avg");
  });
});

describe("Config Validation of old saved views", () => {
  it("should validate traces config uses column IDs not display names", () => {
    // Validate all keys in columnToQueryKey exist as column IDs
    const columnIds = new Set(tracesTableCols.map((col) => col.id));
    const invalidFacets = traceFilterConfig.facets.filter(
      (facet) => !columnIds.has(facet.column),
    );

    expect(invalidFacets).toEqual([]);
  });

  it("should validate observations config uses column IDs not display names", () => {
    const columnIds = new Set(observationsTableCols.map((col) => col.id));
    const invalidFacets = observationFilterConfig.facets.filter(
      (facet) => !columnIds.has(facet.column),
    );

    expect(invalidFacets).toEqual([]);
  });
});

describe("Filter Flow: URL → Decode → Normalize → Transform", () => {
  it("should preserve multiple string contains filters from URL", () => {
    // environment contains "e" AND environment contains "a"
    // These create valid SQL: WHERE env LIKE '%e%' AND env LIKE '%a%'
    const urlFilter =
      "environment;string;;contains;e,environment;string;;contains;a";

    const normalized = decodeAndNormalizeFilters(
      urlFilter,
      sessionFilterConfig.columnDefinitions,
    );

    const result = transformFiltersForBackend(normalized, {});

    // Both filters preserved
    expect(result).toHaveLength(2);
    expect(result[0]?.value).toBe("e");
    expect(result[1]?.value).toBe("a");
  });

  it("should drop filters for columns missing in active table definitions", () => {
    const urlFilter =
      "environment;stringOptions;;any of;production,trace_scores_v4_only;number;;>=;0.8";

    const normalized = decodeAndNormalizeFilters(
      urlFilter,
      traceFilterConfig.columnDefinitions,
    );

    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toEqual({
      column: "environment",
      type: "stringOptions",
      operator: "any of",
      value: ["production"],
    });
  });

  it("should normalize legacy tags filter from URL to the canonical traceTags column", () => {
    const urlFilter = "tags;arrayOptions;;any of;tag1";

    const normalized = decodeAndNormalizeFilters(
      urlFilter,
      traceFilterConfig.columnDefinitions,
    );

    const result = transformFiltersForBackend(normalized, {});

    expect(result).toHaveLength(1);
    expect(result[0]?.column).toBe("traceTags");
  });

  it("should discard stale positionInTrace URL filters on the general events table", () => {
    const urlFilter = "positionInTrace;positionInTrace;last;=;";

    const normalized = decodeAndNormalizeFilters(
      urlFilter,
      observationEventsFilterConfig.columnDefinitions,
    );

    expect(normalized).toEqual([]);
  });
});

describe("Saved view validation", () => {
  it("should discard stale positionInTrace filters on the general events table", () => {
    const filters: FilterState = [
      {
        column: "positionInTrace",
        type: "positionInTrace",
        operator: "=",
        key: "last",
      },
    ];

    expect(
      validateFilters(filters, observationEventsFilterConfig.columnDefinitions),
    ).toEqual([]);
  });

  it("should preserve the session detail positionInTrace presets when the session view defines the column", () => {
    const sessionEventColumns: ColumnDefinition[] = [
      ...observationEventsFilterConfig.columnDefinitions,
      {
        name: "Position in Trace",
        id: "positionInTrace",
        type: "positionInTrace",
        internal: "positionInTrace",
      },
    ];
    const defaultPreset = getSessionDetailPresetToApply({
      selectedViewId: null,
      hasFilters: false,
    });
    const lastPreset = SESSION_DETAIL_SYSTEM_PRESETS.find(
      (preset) => preset.name === "Last Generation in Trace",
    );

    expect(defaultPreset).toEqual(SESSION_DETAIL_SYSTEM_PRESETS[0]);
    expect(defaultPreset?.filters).toEqual([
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["GENERATION"],
      },
      {
        column: "positionInTrace",
        type: "positionInTrace",
        operator: "=",
        key: "first",
      },
    ]);
    expect(
      validateFilters(defaultPreset?.filters ?? [], sessionEventColumns),
    ).toEqual(defaultPreset?.filters ?? []);
    expect(lastPreset?.filters).toEqual([
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["GENERATION"],
      },
      {
        column: "positionInTrace",
        type: "positionInTrace",
        operator: "=",
        key: "last",
      },
    ]);
    expect(SESSION_DETAIL_SYSTEM_PRESETS).not.toContainEqual(
      expect.objectContaining({
        name: "Root Observation",
      }),
    );
  });
});

describe("resolveCheckboxOperator (arrayOptions vs stringOptions)", () => {
  const availableValues = ["tag-1", "tag-2", "tag-3", "tag-4", "tag-5"];

  describe("arrayOptions (e.g., tags)", () => {
    it('should use "any of" with selected values when no existing filter', () => {
      const result = resolveCheckboxOperator({
        colType: "arrayOptions",
        existingFilter: undefined,
        values: ["tag-1", "tag-2"],
        availableValues,
      });

      expect(result).toEqual({
        finalOperator: "any of",
        finalValues: ["tag-1", "tag-2"],
      });
    });

    it('should switch from "none of" to "any of" for arrayOptions', () => {
      const result = resolveCheckboxOperator({
        colType: "arrayOptions",
        existingFilter: {
          column: "tags",
          type: "arrayOptions",
          operator: "none of",
          value: ["tag-3", "tag-4", "tag-5"],
        },
        values: ["tag-1", "tag-2"],
        availableValues,
      });

      // Must NOT keep "none of" — it gives wrong results for multi-valued arrays
      expect(result).toEqual({
        finalOperator: "any of",
        finalValues: ["tag-1", "tag-2"],
      });
    });

    it('should preserve "all of" operator for arrayOptions', () => {
      const result = resolveCheckboxOperator({
        colType: "arrayOptions",
        existingFilter: {
          column: "tags",
          type: "arrayOptions",
          operator: "all of",
          value: ["tag-1"],
        },
        values: ["tag-1", "tag-2"],
        availableValues,
      });

      expect(result).toEqual({
        finalOperator: "all of",
        finalValues: ["tag-1", "tag-2"],
      });
    });

    it('should use "any of" when existing filter is "any of"', () => {
      const result = resolveCheckboxOperator({
        colType: "arrayOptions",
        existingFilter: {
          column: "tags",
          type: "arrayOptions",
          operator: "any of",
          value: ["tag-1"],
        },
        values: ["tag-1", "tag-2", "tag-3"],
        availableValues,
      });

      expect(result).toEqual({
        finalOperator: "any of",
        finalValues: ["tag-1", "tag-2", "tag-3"],
      });
    });
  });

  describe("stringOptions (e.g., environment) — regression tests", () => {
    it('should use "none of" with deselected values when no existing filter', () => {
      const result = resolveCheckboxOperator({
        colType: "stringOptions",
        existingFilter: undefined,
        values: ["tag-1", "tag-2"],
        availableValues,
      });

      // "none of" inversion is safe for single-valued columns
      expect(result).toEqual({
        finalOperator: "none of",
        finalValues: ["tag-3", "tag-4", "tag-5"],
      });
    });

    it('should keep "none of" with updated deselected values for stringOptions', () => {
      const result = resolveCheckboxOperator({
        colType: "stringOptions",
        existingFilter: {
          column: "environment",
          type: "stringOptions",
          operator: "none of",
          value: ["tag-3", "tag-4", "tag-5"],
        },
        values: ["tag-1", "tag-2", "tag-3"],
        availableValues,
      });

      expect(result).toEqual({
        finalOperator: "none of",
        finalValues: ["tag-4", "tag-5"],
      });
    });

    it('should use "any of" when existing filter is "any of" for stringOptions', () => {
      const result = resolveCheckboxOperator({
        colType: "stringOptions",
        existingFilter: {
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["tag-1"],
        },
        values: ["tag-1", "tag-2"],
        availableValues,
      });

      expect(result).toEqual({
        finalOperator: "any of",
        finalValues: ["tag-1", "tag-2"],
      });
    });
  });
});

describe("Implicit Environment Defaults (sidebar only)", () => {
  const hiddenEnvironments = [...DEFAULT_SIDEBAR_HIDDEN_ENVIRONMENTS];
  const availableValues = [
    "production",
    "staging",
    ...hiddenEnvironments,
  ] as const;
  const managedEnvironmentConfig = buildManagedEnvironmentPolicyConfig({
    managedEnvironmentColumn: "environment",
    hiddenEnvironments,
  });
  const strip = (explicitFilters: FilterState) =>
    stripImplicitEnvironmentFilterFromExplicitState({
      explicitFilters,
      availableEnvironmentValues: [...availableValues],
      config: managedEnvironmentConfig,
    });

  it("applies implicit env exclusion only when no explicit env filter exists", () => {
    expect(
      buildImplicitEnvironmentFilter({
        explicitFilters: [
          {
            column: "name",
            type: "stringOptions",
            operator: "any of",
            value: ["trace-a"],
          },
        ],
        config: managedEnvironmentConfig,
      }),
    ).toEqual([
      {
        column: "environment",
        type: "stringOptions",
        operator: "none of",
        value: hiddenEnvironments,
      },
    ]);

    expect(
      buildImplicitEnvironmentFilter({
        explicitFilters: [
          {
            column: "environment",
            type: "stringOptions",
            operator: "any of",
            value: ["production"],
          },
        ],
        config: managedEnvironmentConfig,
      }),
    ).toEqual([]);
  });

  it("strips default-equivalent env filters before URL/session persistence", () => {
    const explicitWithExactDefault: FilterState = [
      {
        column: "environment",
        type: "stringOptions",
        operator: "none of",
        value: hiddenEnvironments,
      },
      {
        column: "name",
        type: "stringOptions",
        operator: "any of",
        value: ["trace-a"],
      },
    ];

    expect(strip(explicitWithExactDefault)).toEqual([
      {
        column: "name",
        type: "stringOptions",
        operator: "any of",
        value: ["trace-a"],
      },
    ]);

    expect(
      strip([
        {
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["production", "staging"],
        },
      ]),
    ).toEqual([]);
  });

  it("keeps explicit overrides that enable hidden environments", () => {
    const explicitWithHiddenEnabled: FilterState = [
      {
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: ["production", "langfuse-evaluation"],
      },
      {
        column: "name",
        type: "stringOptions",
        operator: "any of",
        value: ["trace-a"],
      },
    ];

    expect(strip(explicitWithHiddenEnabled)).toEqual(explicitWithHiddenEnabled);

    const explicitAll: FilterState = [
      {
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: [...availableValues],
      },
    ];

    expect(strip(explicitAll)).toEqual(explicitAll);
  });

  it("keeps hidden-only explicit selection as explicit override", () => {
    expect(
      strip([
        {
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["langfuse-evaluation"],
        },
      ]),
    ).toEqual([
      {
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: ["langfuse-evaluation"],
      },
    ]);
  });

  it("returns explicit environment filters as effective state", () => {
    expect(
      buildEffectiveEnvironmentFilter({
        explicitFilters: [
          {
            column: "environment",
            type: "stringOptions",
            operator: "any of",
            value: ["langfuse-evaluation"],
          },
        ],
        config: managedEnvironmentConfig,
      }),
    ).toEqual([
      {
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: ["langfuse-evaluation"],
      },
    ]);
  });
});
