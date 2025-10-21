/**
 * Integration tests for filter query encoding/decoding through full URL lifecycle.
 * These tests verify the complete flow: FilterState → URL → FilterState
 * using browser URLSearchParams APIs to simulate real-world usage.
 */

import { type FilterState } from "@langfuse/shared";
import {
  encodeFiltersGeneric,
  decodeFiltersGeneric,
  type ColumnToQueryKeyMap,
  type GenericFilterOptions,
} from "./lib/filter-query-encoding";

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

    edgeCases.forEach(({ filters, description }) => {
      const result = simulateUrlFlow(filters);
      expect(result).toEqual(filters);
    });

    // Empty filters
    expect(simulateUrlFlow([])).toEqual([]);
  });
});
