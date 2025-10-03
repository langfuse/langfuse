import {
  convertLegacyParamsToFilterState,
  mergeFilters,
  type LegacyTraceParams,
} from "@langfuse/shared/src/server";
import type { FilterState } from "@langfuse/shared";

describe("Filter Conversion Utilities", () => {
  describe("convertLegacyParamsToFilterState", () => {
    it("should convert empty params to empty FilterState", () => {
      const result = convertLegacyParamsToFilterState({});
      expect(result).toEqual([]);
    });

    const singleParamTestCases = [
      {
        description: "userId to string filter",
        params: { userId: "test-user" },
        expected: [
          {
            type: "string",
            column: "userId",
            operator: "=",
            value: "test-user",
          },
        ],
      },
      {
        description: "name to string filter",
        params: { name: "test-trace" },
        expected: [
          {
            type: "string",
            column: "name",
            operator: "=",
            value: "test-trace",
          },
        ],
      },
      {
        description: "sessionId to string filter",
        params: { sessionId: "session-123" },
        expected: [
          {
            type: "string",
            column: "sessionId",
            operator: "=",
            value: "session-123",
          },
        ],
      },
      {
        description: "version to string filter",
        params: { version: "1.0" },
        expected: [
          { type: "string", column: "version", operator: "=", value: "1.0" },
        ],
      },
      {
        description: "release to string filter",
        params: { release: "v1.0.0" },
        expected: [
          { type: "string", column: "release", operator: "=", value: "v1.0.0" },
        ],
      },
      {
        description: "single tag to array options filter",
        params: { tags: "production" },
        expected: [
          {
            type: "arrayOptions",
            column: "tags",
            operator: "any of",
            value: ["production"],
          },
        ],
      },
      {
        description: "multiple tags to array options filter",
        params: { tags: ["production", "important"] },
        expected: [
          {
            type: "arrayOptions",
            column: "tags",
            operator: "any of",
            value: ["production", "important"],
          },
        ],
      },
      {
        description: "single environment to string options filter",
        params: { environment: "production" },
        expected: [
          {
            type: "stringOptions",
            column: "environment",
            operator: "any of",
            value: ["production"],
          },
        ],
      },
      {
        description: "multiple environments to string options filter",
        params: { environment: ["production", "staging"] },
        expected: [
          {
            type: "stringOptions",
            column: "environment",
            operator: "any of",
            value: ["production", "staging"],
          },
        ],
      },
    ] as const;

    it.each(singleParamTestCases)(
      "should convert $description",
      ({ params, expected }) => {
        const result = convertLegacyParamsToFilterState(params);
        expect(result).toEqual(expected);
      },
    );

    it("should convert timestamps to datetime filters", () => {
      const fromTime = "2024-01-01T00:00:00Z";
      const toTime = "2024-01-02T00:00:00Z";
      const params: LegacyTraceParams = {
        fromTimestamp: fromTime,
        toTimestamp: toTime,
      };
      const result = convertLegacyParamsToFilterState(params);
      expect(result).toEqual([
        {
          type: "datetime",
          column: "timestamp",
          operator: ">=",
          value: new Date(fromTime),
        },
        {
          type: "datetime",
          column: "timestamp",
          operator: "<",
          value: new Date(toTime),
        },
      ]);
    });

    it("should convert all parameters together", () => {
      const params: LegacyTraceParams = {
        userId: "test-user",
        name: "test-trace",
        tags: ["prod", "important"],
        environment: "production",
        sessionId: "session-123",
        version: "1.0",
        release: "v1.0.0",
        fromTimestamp: "2024-01-01T00:00:00Z",
        toTimestamp: "2024-01-02T00:00:00Z",
      };
      const result = convertLegacyParamsToFilterState(params);

      expect(result).toHaveLength(9);
      expect(result).toContainEqual({
        type: "string",
        column: "userId",
        operator: "=",
        value: "test-user",
      });
      expect(result).toContainEqual({
        type: "arrayOptions",
        column: "tags",
        operator: "any of",
        value: ["prod", "important"],
      });
      expect(result).toContainEqual({
        type: "stringOptions",
        column: "environment",
        operator: "any of",
        value: ["production"],
      });
    });
  });

  describe("mergeFilters", () => {
    const mergeTestCases = [
      {
        description:
          "should return legacy filters when no advanced filter provided",
        legacyParams: { userId: "test-user" },
        advancedFilter: undefined,
        expected: [
          {
            type: "string",
            column: "userId",
            operator: "=",
            value: "test-user",
          },
        ],
      },
      {
        description:
          "should return legacy filters when empty advanced filter provided",
        legacyParams: { userId: "test-user" },
        advancedFilter: [],
        expected: [
          {
            type: "string",
            column: "userId",
            operator: "=",
            value: "test-user",
          },
        ],
      },
      {
        description: "should prioritize advanced filter over legacy params",
        legacyParams: { userId: "legacy-user" },
        advancedFilter: [
          {
            type: "string",
            column: "userId",
            operator: "=",
            value: "advanced-user",
          },
        ],
        expected: [
          {
            type: "string",
            column: "userId",
            operator: "=",
            value: "advanced-user",
          },
        ],
      },
    ] as const;

    it.each(mergeTestCases)(
      "$description",
      ({ legacyParams, advancedFilter, expected }) => {
        const result = mergeFilters(legacyParams, advancedFilter);
        expect(result).toEqual(expected);
      },
    );

    it("should merge non-conflicting filters", () => {
      const legacyParams: LegacyTraceParams = {
        userId: "legacy-user",
        tags: ["prod"],
      };
      const advancedFilter: FilterState = [
        {
          type: "stringObject",
          column: "metadata",
          key: "environment",
          operator: "=",
          value: "production",
        },
      ];

      const result = mergeFilters(legacyParams, advancedFilter);

      expect(result).toHaveLength(3); // advanced filter + 2 legacy filters
      expect(result).toContainEqual({
        type: "stringObject",
        column: "metadata",
        key: "environment",
        operator: "=",
        value: "production",
      });
      expect(result).toContainEqual({
        type: "string",
        column: "userId",
        operator: "=",
        value: "legacy-user",
      });
      expect(result).toContainEqual({
        type: "arrayOptions",
        column: "tags",
        operator: "any of",
        value: ["prod"],
      });
    });

    it("should handle complex merge scenarios", () => {
      const legacyParams: LegacyTraceParams = {
        userId: "legacy-user", // This should be overridden
        name: "legacy-name", // This should be kept
        tags: ["legacy-tag"], // This should be overridden
      };
      const advancedFilter: FilterState = [
        {
          type: "string",
          column: "userId",
          operator: "contains",
          value: "advanced-user",
        },
        {
          type: "arrayOptions",
          column: "tags",
          operator: "any of",
          value: ["advanced-tag", "important"],
        },
      ];

      const result = mergeFilters(legacyParams, advancedFilter);

      expect(result).toHaveLength(3); // 2 advanced + 1 non-conflicting legacy
      expect(result).toContainEqual({
        type: "string",
        column: "userId",
        operator: "contains",
        value: "advanced-user",
      });
      expect(result).toContainEqual({
        type: "arrayOptions",
        column: "tags",
        operator: "any of",
        value: ["advanced-tag", "important"],
      });
      expect(result).toContainEqual({
        type: "string",
        column: "name",
        operator: "=",
        value: "legacy-name",
      });
    });
  });
});
