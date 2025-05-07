import { randomUUID } from "crypto";
import { QueryBuilder } from "@/src/features/query/server/queryBuilder";
import { type QueryType } from "@/src/features/query/types";
import { TRPCError } from "@trpc/server";
import { executeQuery } from "@/src/features/dashboard/server/dashboard-router";

/**
 * Test suite for testing SQL injection vulnerabilities in the QueryBuilder
 */
describe("QueryBuilder SQL Injection Tests", () => {
  // Single project ID for all tests
  const projectId = randomUUID();

  // Time references
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 3600000);

  // Time ranges for queries - converted to ClickHouse DateTime format
  const defaultFromTime = threeDaysAgo.toISOString();
  const defaultToTime = now.toISOString();

  // Create a mock ClickHouse client for testing
  const mockClickhouseClient = {
    query: jest.fn().mockImplementation(({ query, query_params }) => {
      // Return the query and params for inspection in tests
      return Promise.resolve({
        json: jest.fn().mockReturnValue({
          data: [],
          query,
          params: query_params,
        }),
      });
    }),
  };

  // Helper function to build a query without executing it
  const buildQueryWithoutExecuting = (query: QueryType, projectId: string) => {
    const queryBuilder = new QueryBuilder(mockClickhouseClient as any);
    return queryBuilder.build(query, projectId);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("SQL Injection via View Parameter", () => {
    it("should prevent injection via invalid view name", async () => {
      // Comment: The view property is restricted to specific enum values,
      // but a determined attacker might try to bypass zod validation or
      // supply a maliciously crafted view name
      const maliciousQuery = {
        view: "traces; DROP TABLE users" as any,
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
      };

      // Should throw an error rather than allow the injection
      expect(() =>
        buildQueryWithoutExecuting(maliciousQuery, projectId),
      ).toThrow("Invalid query");
    });
  });

  describe("SQL Injection via Dimension Fields", () => {
    it("should prevent injection via dimension field name", async () => {
      // Comment: The field names in dimensions should be validated against allowed fields
      // in the view declaration. This test checks if an attacker can inject arbitrary SQL
      // by manipulating the dimension field name.
      const maliciousQuery: QueryType = {
        view: "traces",
        dimensions: [{ field: "name; DROP TABLE traces; --" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      // Should throw an error for invalid dimension
      expect(() =>
        buildQueryWithoutExecuting(maliciousQuery, projectId),
      ).toThrow("Invalid dimension");
    });

    it("should safely handle special characters in valid dimension fields", async () => {
      // Comment: Even with valid fields, we need to ensure special characters
      // don't lead to injections when building the SQL query
      const query: QueryType = {
        view: "traces",
        dimensions: [{ field: "name" }], // Valid field
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            column: "name",
            operator: "=",
            value: "chat'; DROP TABLE traces; --", // SQL injection in value
            type: "string",
          },
        ],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      // Should build a valid query using parameterized queries for safety
      const result = buildQueryWithoutExecuting(query, projectId);

      // Ensure the value is parameterized and not directly included in the SQL
      expect(result.query).not.toContain("chat'; DROP TABLE traces; --");
      expect(Object.values(result.parameters)).toContain(
        "chat'; DROP TABLE traces; --",
      );
    });
  });

  describe("SQL Injection via Metrics", () => {
    it("should prevent injection via metric measure name", async () => {
      // Comment: Similar to dimensions, metrics should be validated against allowed measures
      // This test checks if an attacker can inject SQL via the measure property
      const maliciousQuery: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [
          {
            measure: "count); DROP TABLE traces; --",
            aggregation: "count",
          },
        ],
        filters: [],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      // Should throw an error for invalid metric
      expect(() =>
        buildQueryWithoutExecuting(maliciousQuery, projectId),
      ).toThrow("Invalid metric");
    });

    it("should prevent injection via metric aggregation", async () => {
      // Comment: The aggregation function could be another injection vector if
      // not properly validated
      const maliciousQuery: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [
          {
            measure: "count",
            aggregation: "count); DROP TABLE traces; --" as any,
          },
        ],
        filters: [],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      // Should throw an error for invalid aggregation
      expect(() =>
        buildQueryWithoutExecuting(maliciousQuery, projectId),
      ).toThrow("Invalid query");
    });
  });

  describe("SQL Injection via Filters", () => {
    it("should prevent injection via filter field name", async () => {
      // Comment: Filter field names must be validated like dimensions
      const maliciousQuery: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            column: "environment); DROP TABLE traces; --",
            operator: "=",
            value: "production",
            type: "string",
          },
        ],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      // Should throw an error for invalid filter field
      expect(() =>
        buildQueryWithoutExecuting(maliciousQuery, projectId),
      ).toThrow("Invalid filter");
    });

    it("should prevent injection via filter operator", async () => {
      // Comment: Filter operators should be validated against a list of allowed operators
      const maliciousQuery: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            column: "environment",
            operator: "=; DROP TABLE traces; --" as any,
            value: "production",
            type: "string",
          },
        ],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      // Should throw an error for invalid operator
      expect(() =>
        buildQueryWithoutExecuting(maliciousQuery, projectId),
      ).toThrow("Invalid query");
    });

    it("should safely handle special characters in filter values", async () => {
      // Comment: Filter values should be parameterized to prevent injection
      const query: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            column: "environment",
            operator: "=",
            type: "string",
            value: "production'; DROP TABLE traces; --",
          },
        ],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      // Should build a valid query with parameterization
      const result = buildQueryWithoutExecuting(query, projectId);

      // Check for parameterization
      expect(result.query).not.toContain("production'; DROP TABLE traces; --");
      expect(Object.values(result.parameters)).toContain(
        "production'; DROP TABLE traces; --",
      );
    });

    it("should safely handle array values in IN operators", async () => {
      // Comment: IN operators with arrays need special handling for SQL injection prevention
      const query: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            column: "environment",
            operator: "any of",
            value: ["production", "development'); DROP TABLE traces; --"],
            type: "stringOptions",
          },
        ],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      // Should parameterize the values
      const result = buildQueryWithoutExecuting(query, projectId);

      expect(result.query).not.toContain(
        "production,development'); DROP TABLE traces; --",
      );
    });

    it("should prevent SQL injection via metadata column name", async () => {
      // Comment: The metadata column name should be validated to prevent SQL injection
      const maliciousQuery: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            column: "metadata); DROP TABLE traces; --",
            operator: "contains",
            key: "customer",
            value: "test",
            type: "stringObject",
          },
        ],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      // Should throw an error for invalid filter field
      expect(() =>
        buildQueryWithoutExecuting(maliciousQuery, projectId),
      ).toThrow("Invalid filter");
    });

    it("should prevent SQL injection via metadata operator", async () => {
      // Comment: The metadata operator should be validated to prevent SQL injection
      const maliciousQuery: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            column: "metadata",
            operator: "contains); DROP TABLE traces; --" as any,
            key: "customer",
            value: "test",
            type: "stringObject",
          },
        ],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      // Should throw an error for invalid operator
      expect(() =>
        buildQueryWithoutExecuting(maliciousQuery, projectId),
      ).toThrow("Invalid query");
    });

    it("should safely handle special characters in metadata key path", async () => {
      // Comment: The key path in metadata filters should be properly escaped
      const query: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            column: "metadata",
            operator: "contains",
            key: "customer.field'); DROP TABLE traces; --",
            value: "test",
            type: "stringObject",
          },
        ],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      // Should build a valid query with parameterization
      const result = buildQueryWithoutExecuting(query, projectId);

      // Check for parameterization
      expect(result.query).not.toContain(
        "customer.field'); DROP TABLE traces; --",
      );
      expect(Object.values(result.parameters)).toContain(
        "customer.field'); DROP TABLE traces; --",
      );
    });

    it("should safely handle special characters in metadata value", async () => {
      // Comment: The value in metadata filters should be properly parameterized
      const query: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            column: "metadata",
            operator: "contains",
            key: "customer",
            value: "test'); DROP TABLE traces; --",
            type: "stringObject",
          },
        ],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      // Should build a valid query with parameterization
      const result = buildQueryWithoutExecuting(query, projectId);

      // Check for parameterization
      expect(result.query).not.toContain("test'); DROP TABLE traces; --");
      expect(Object.values(result.parameters)).toContain(
        "test'); DROP TABLE traces; --",
      );
    });

    it("should prevent SQL injection via metadata filter type", async () => {
      // Comment: The type field should be validated to prevent SQL injection
      const maliciousQuery: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            column: "metadata",
            operator: "contains",
            key: "customer",
            value: "test",
            type: "stringObject); DROP TABLE traces; --" as any,
          },
        ],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      // Should throw an error for invalid type
      expect(() =>
        buildQueryWithoutExecuting(maliciousQuery, projectId),
      ).toThrow("Invalid query");
    });
  });

  describe("SQL Injection via Time Dimension", () => {
    it("should prevent injection via time dimension granularity", async () => {
      // Comment: Time dimension granularity should be validated against allowed values
      const maliciousQuery: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: {
          granularity: "minute; DROP TABLE traces; --" as any,
        },
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };
      // Should throw an error for invalid granularity
      expect(() =>
        buildQueryWithoutExecuting(maliciousQuery, projectId),
      ).toThrow("Invalid query");
    });
  });

  describe("SQL Injection via Timestamp Parameters", () => {
    it("should safely handle malicious timestamp strings", async () => {
      // Comment: Timestamps need to be properly validated and converted
      // to prevent SQL injection
      const maliciousQuery: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: "2023-01-01'); DROP TABLE traces; --",
        toTimestamp: defaultToTime,
        orderBy: null,
      };
      // Should throw an error for invalid timestamp format
      expect(() =>
        buildQueryWithoutExecuting(maliciousQuery, projectId),
      ).toThrow("Invalid query");
    });
  });

  describe("SQL Injection via Project ID", () => {
    it("should safely handle malicious project ID", async () => {
      // Comment: Project ID is a critical parameter that must be properly sanitized
      const query: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      const maliciousProjectId = "fake-id'; DROP TABLE traces; --";

      // Should parameterize the project ID
      const result = buildQueryWithoutExecuting(query, maliciousProjectId);

      // Check for parameterization
      expect(result.query).not.toContain(maliciousProjectId);
      expect(Object.values(result.parameters)).toContain(maliciousProjectId);
    });
  });

  describe("SQL Injection via OrderBy Parameters", () => {
    it("should prevent injection via orderBy field name", async () => {
      // Comment: The field names in orderBy should be validated against dimension and metric fields
      // to prevent SQL injection via field name
      const maliciousQuery: QueryType = {
        view: "traces",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: [
          {
            field: "name; DROP TABLE traces; --",
            direction: "asc",
          },
        ],
      };

      // Should throw an error for invalid orderBy field
      expect(() =>
        buildQueryWithoutExecuting(maliciousQuery, projectId),
      ).toThrow("Invalid orderBy field");
    });

    it("should prevent injection via orderBy direction", async () => {
      // Comment: The direction value should be validated to prevent SQL injection
      const maliciousQuery: QueryType = {
        view: "traces",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: [
          {
            field: "name",
            direction: "asc; DROP TABLE traces; --" as any,
          },
        ],
      };

      // Should throw an error for invalid direction
      expect(() =>
        buildQueryWithoutExecuting(maliciousQuery, projectId),
      ).toThrow("Invalid query");
    });

    it("should prevent injection via non-existing metric field in orderBy", async () => {
      // Comment: The field must exist as a metric with proper aggregation prefix
      const maliciousQuery: QueryType = {
        view: "traces",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: [
          {
            field: "sum_malicious_metric; DROP TABLE traces; --",
            direction: "asc",
          },
        ],
      };

      // Should throw an error for invalid orderBy field
      expect(() =>
        buildQueryWithoutExecuting(maliciousQuery, projectId),
      ).toThrow("Invalid orderBy field");
    });
  });

  describe("Integration with executeQuery function", () => {
    it("should safely handle malicious query parameters through executeQuery", async () => {
      // Comment: This tests the integration with the dashboard router's executeQuery function
      // to ensure SQL injection protection works end-to-end
      jest.spyOn(console, "error").mockImplementation(() => {});

      const maliciousQuery: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [
          {
            measure: "count); DELETE FROM traces; --" as any,
            aggregation: "count",
          },
        ],
        filters: [],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      // Expect the executeQuery function to throw a TRPC error
      // rather than allowing the injection
      await expect(executeQuery(projectId, maliciousQuery)).rejects.toThrow(
        TRPCError,
      );
    });
  });
});
