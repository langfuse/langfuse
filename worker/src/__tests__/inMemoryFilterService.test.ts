import { describe, expect, test } from "vitest";
import { InMemoryFilterService } from "@langfuse/shared/src/server";

describe("InMemoryFilterService", () => {
  const mockData = {
    id: "trace-123",
    name: "test-trace",
    timestamp: new Date("2024-01-01T10:00:00Z"),
    environment: "production",
    tags: ["tag1", "tag2", "important"],
    bookmarked: true,
    public: false,
    release: "v1.0.0",
    metadata: {
      userId: "user-123",
      customField: "custom-value",
      numericField: 42,
    },
    userId: "user-123",
    projectId: "project-789",
    scores: {
      accuracy: 0.95,
      precision: 0.87,
      recall: 0.92,
    },
    categories: {
      type: "classification",
      model: "gpt-4",
      version: "v1.2.3",
    },
    cost: 0.0025,
    latency: 1500,
    tokenCount: 250,
  };

  // Simple field mapper for testing
  const fieldMapper = (
    data: typeof mockData,
    column: keyof typeof mockData,
  ): any => {
    switch (column) {
      case "id":
        return data.id;
      case "name":
        return data.name;
      case "timestamp":
        return data.timestamp;
      case "environment":
        return data.environment;
      case "tags":
        return data.tags;
      case "bookmarked":
        return data.bookmarked;
      case "public":
        return data.public;
      case "release":
        return data.release;
      case "userId":
        return data.userId;
      case "metadata":
        return data.metadata;
      case "scores":
        return data.scores;
      case "categories":
        return data.categories;
      case "cost":
        return data.cost;
      case "latency":
        return data.latency;
      case "tokenCount":
        return data.tokenCount;
      default:
        return undefined;
    }
  };

  describe("evaluateFilter", () => {
    test("returns true for empty filter", () => {
      const result = InMemoryFilterService.evaluateFilter(
        mockData,
        [],
        fieldMapper,
      );
      expect(result).toBe(true);
    });

    test("evaluates string filters correctly", () => {
      // Exact match
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "name",
              type: "string",
              operator: "=",
              value: "test-trace",
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);

      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "name",
              type: "string",
              operator: "=",
              value: "wrong-name",
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);

      // Contains
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "name",
              type: "string",
              operator: "contains",
              value: "test",
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);

      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "name",
              type: "string",
              operator: "contains",
              value: "missing",
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);

      // Starts with
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "name",
              type: "string",
              operator: "starts with",
              value: "test",
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);

      // Ends with
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "name",
              type: "string",
              operator: "ends with",
              value: "trace",
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);
    });

    test("evaluates datetime filters correctly", () => {
      const beforeTime = new Date("2023-12-31T23:59:59Z");
      const afterTime = new Date("2024-01-01T11:00:00Z");

      // Greater than
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "timestamp",
              type: "datetime",
              operator: ">",
              value: beforeTime,
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);

      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "timestamp",
              type: "datetime",
              operator: ">",
              value: afterTime,
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);

      // Less than
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "timestamp",
              type: "datetime",
              operator: "<",
              value: afterTime,
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);

      // Greater than or equal
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "timestamp",
              type: "datetime",
              operator: ">=",
              value: mockData.timestamp,
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);
    });

    test("evaluates number filters correctly", () => {
      // Exact match
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "cost",
              type: "number",
              operator: "=",
              value: 0.0025,
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);

      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "cost",
              type: "number",
              operator: "=",
              value: 0.005,
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);

      // Greater than
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "latency",
              type: "number",
              operator: ">",
              value: 1000,
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);

      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "latency",
              type: "number",
              operator: ">",
              value: 2000,
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);

      // Less than
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "tokenCount",
              type: "number",
              operator: "<",
              value: 300,
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);

      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "tokenCount",
              type: "number",
              operator: "<",
              value: 200,
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);

      // Greater than or equal
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "latency",
              type: "number",
              operator: ">=",
              value: 1500,
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);

      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "latency",
              type: "number",
              operator: ">=",
              value: 1600,
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);

      // Less than or equal
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "tokenCount",
              type: "number",
              operator: "<=",
              value: 250,
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);

      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "tokenCount",
              type: "number",
              operator: "<=",
              value: 200,
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);

      // Test with non-number field value
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "name",
              type: "number",
              operator: "=",
              value: 42,
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);

      // Test with decimal numbers
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "cost",
              type: "number",
              operator: ">",
              value: 0.002,
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);

      // Test with zero
      const dataWithZeroCost = { ...mockData, cost: 0 };
      expect(
        InMemoryFilterService.evaluateFilter(
          dataWithZeroCost,
          [
            {
              column: "cost",
              type: "number",
              operator: "=",
              value: 0,
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);

      // Test with negative numbers
      const dataWithNegativeValue = { ...mockData, cost: -0.001 };
      expect(
        InMemoryFilterService.evaluateFilter(
          dataWithNegativeValue,
          [
            {
              column: "cost",
              type: "number",
              operator: "<",
              value: 0,
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);
    });

    test("evaluates boolean filters correctly", () => {
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "bookmarked",
              type: "boolean",
              operator: "=",
              value: true,
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);

      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "bookmarked",
              type: "boolean",
              operator: "=",
              value: false,
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);

      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [{ column: "public", type: "boolean", operator: "<>", value: true }],
          fieldMapper,
        ),
      ).toBe(true);
    });

    test("evaluates stringOptions filters correctly", () => {
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "environment",
              type: "stringOptions",
              operator: "any of",
              value: ["production", "staging"],
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);

      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "environment",
              type: "stringOptions",
              operator: "any of",
              value: ["development", "staging"],
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);

      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "environment",
              type: "stringOptions",
              operator: "none of",
              value: ["development", "staging"],
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);
    });

    test("evaluates categoryOptions filters correctly", () => {
      // Any of - matching values
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "categories",
              type: "categoryOptions",
              key: "type",
              operator: "any of",
              value: ["classification", "regression"],
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);

      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "categories",
              type: "categoryOptions",
              key: "model",
              operator: "any of",
              value: ["gpt-4", "gpt-3.5"],
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);

      // Any of - non-matching values
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "categories",
              type: "categoryOptions",
              key: "type",
              operator: "any of",
              value: ["regression", "clustering"],
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);

      // None of - non-matching values (should return true)
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "categories",
              type: "categoryOptions",
              key: "type",
              operator: "none of",
              value: ["regression", "clustering"],
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);

      // None of - matching values (should return false)
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "categories",
              type: "categoryOptions",
              key: "model",
              operator: "none of",
              value: ["gpt-4", "claude"],
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);

      // Test with non-existent key
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "categories",
              type: "categoryOptions",
              key: "nonExistentKey",
              operator: "any of",
              value: ["someValue"],
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);

      // Test with non-object field value
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "name",
              type: "categoryOptions",
              key: "someKey",
              operator: "any of",
              value: ["someValue"],
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);

      // Test with null/undefined field value
      const dataWithNullCategories = { ...mockData, categories: null };
      expect(
        InMemoryFilterService.evaluateFilter(
          dataWithNullCategories,
          [
            {
              column: "categories",
              type: "categoryOptions",
              key: "type",
              operator: "any of",
              value: ["classification"],
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);
    });

    test("evaluates arrayOptions filters correctly", () => {
      // Any of
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "tags",
              type: "arrayOptions",
              operator: "any of",
              value: ["tag1", "missing"],
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);

      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "tags",
              type: "arrayOptions",
              operator: "any of",
              value: ["missing", "absent"],
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);

      // None of
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "tags",
              type: "arrayOptions",
              operator: "none of",
              value: ["missing", "absent"],
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);

      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "tags",
              type: "arrayOptions",
              operator: "none of",
              value: ["tag1", "missing"],
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);

      // All of
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "tags",
              type: "arrayOptions",
              operator: "all of",
              value: ["tag1", "tag2"],
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);

      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "tags",
              type: "arrayOptions",
              operator: "all of",
              value: ["tag1", "missing"],
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);
    });

    test("evaluates stringObject filters correctly", () => {
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "metadata",
              type: "stringObject",
              key: "userId",
              operator: "=",
              value: "user-123",
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);

      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "metadata",
              type: "stringObject",
              key: "userId",
              operator: "=",
              value: "wrong-user",
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);

      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "metadata",
              type: "stringObject",
              key: "customField",
              operator: "contains",
              value: "custom",
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);
    });

    test("evaluates numberObject filters correctly", () => {
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "metadata",
              type: "numberObject",
              key: "numericField",
              operator: "=",
              value: 42,
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);

      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "metadata",
              type: "numberObject",
              key: "numericField",
              operator: ">",
              value: 40,
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);

      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "metadata",
              type: "numberObject",
              key: "numericField",
              operator: "<",
              value: 40,
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);
    });

    test("evaluates null filters correctly", () => {
      const dataWithNulls = { ...mockData, release: null };

      expect(
        InMemoryFilterService.evaluateFilter(
          dataWithNulls,
          [{ column: "release", type: "null", operator: "is null", value: "" }],
          fieldMapper,
        ),
      ).toBe(true);

      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "release",
              type: "null",
              operator: "is not null",
              value: "",
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);
    });

    test("evaluates multiple filters with AND logic", () => {
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "name",
              type: "string",
              operator: "=",
              value: "test-trace",
            },
            {
              column: "environment",
              type: "string",
              operator: "=",
              value: "production",
            },
            {
              column: "bookmarked",
              type: "boolean",
              operator: "=",
              value: true,
            },
          ],
          fieldMapper,
        ),
      ).toBe(true);

      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "name",
              type: "string",
              operator: "=",
              value: "test-trace",
            },
            {
              column: "environment",
              type: "string",
              operator: "=",
              value: "development",
            }, // This will fail
            {
              column: "bookmarked",
              type: "boolean",
              operator: "=",
              value: true,
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);
    });

    test("handles unknown columns gracefully", () => {
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "unknownColumn",
              type: "string",
              operator: "=",
              value: "test",
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);
    });

    test("handles unsupported operators gracefully and logs errors", () => {
      // Test unsupported string operator
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "name",
              type: "string",
              operator: "unsupported_op",
              value: "test",
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);

      // Test unsupported boolean operator
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "bookmarked",
              type: "boolean",
              operator: "unsupported_op",
              value: true,
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);

      // Test unsupported datetime operator
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "timestamp",
              type: "datetime",
              operator: "unsupported_op",
              value: new Date(),
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);

      // Test unsupported stringOptions operator
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "environment",
              type: "stringOptions",
              operator: "unsupported_op",
              value: ["test"],
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);

      // Test unsupported arrayOptions operator
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "tags",
              type: "arrayOptions",
              operator: "unsupported_op",
              value: ["test"],
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);

      // Test unsupported numberObject operator
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "metadata",
              type: "numberObject",
              key: "numericField",
              operator: "unsupported_op",
              value: 42,
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);

      // Test unsupported null operator
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "release",
              type: "null",
              operator: "unsupported_op",
              value: "",
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);

      // Test unsupported number operator
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "cost",
              type: "number",
              operator: "unsupported_op",
              value: 0.005,
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);

      // Test unsupported categoryOptions operator
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "categories",
              type: "categoryOptions",
              key: "type",
              operator: "unsupported_op",
              value: ["classification"],
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);
    });

    test("handles unsupported filter types gracefully and logs errors", () => {
      // Test unsupported filter type
      expect(
        InMemoryFilterService.evaluateFilter(
          mockData,
          [
            {
              column: "name",
              type: "unsupportedType" as any,
              operator: "=",
              value: "test",
            },
          ],
          fieldMapper,
        ),
      ).toBe(false);
    });
  });
});
