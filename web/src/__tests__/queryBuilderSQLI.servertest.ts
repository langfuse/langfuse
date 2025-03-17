import { randomUUID } from "crypto";
import { convertDateToClickhouseDateTime } from "@langfuse/shared/src/server";
import { QueryBuilder } from "@/src/features/query/server/queryBuilder";
import { type QueryType } from "@/src/features/query/server/types";
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
        page: 0,
        limit: 50,
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
        page: 0,
        limit: 50,
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
            field: "name",
            operator: "eq",
            value: "chat'; DROP TABLE traces; --", // SQL injection in value
          },
        ],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        page: 0,
        limit: 50,
      };

      // Should build a valid query using parameterized queries for safety
      const result = buildQueryWithoutExecuting(query, projectId);

      // Ensure the value is parameterized and not directly included in the SQL
      expect(result.query).not.toContain("chat'; DROP TABLE traces; --");
      expect(result.parameters).toHaveProperty(
        "filter_name_1",
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
        page: 0,
        limit: 50,
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
        page: 0,
        limit: 50,
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
            field: "environment); DROP TABLE traces; --",
            operator: "eq",
            value: "production",
          },
        ],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        page: 0,
        limit: 50,
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
            field: "environment",
            operator: "eq; DROP TABLE traces; --" as any,
            value: "production",
          },
        ],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        page: 0,
        limit: 50,
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
            field: "environment",
            operator: "eq",
            value: "production'; DROP TABLE traces; --",
          },
        ],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        page: 0,
        limit: 50,
      };

      // Should build a valid query with parameterization
      const result = buildQueryWithoutExecuting(query, projectId);

      // Check for parameterization
      expect(result.query).not.toContain("production'; DROP TABLE traces; --");
      expect(result.parameters).toHaveProperty(
        "filter_environment_1",
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
            field: "environment",
            operator: "in",
            value: "production,development'); DROP TABLE traces; --",
          },
        ],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        page: 0,
        limit: 50,
      };

      // Should parameterize the values
      const result = buildQueryWithoutExecuting(query, projectId);

      expect(result.query).not.toContain(
        "production,development'); DROP TABLE traces; --",
      );
      expect(result.parameters).toHaveProperty("filter_environment_1");
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
        page: 0,
        limit: 50,
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
        page: 0,
        limit: 50,
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
        page: 0,
        limit: 50,
      };

      const maliciousProjectId = "fake-id'; DROP TABLE traces; --";

      // Should parameterize the project ID
      const result = buildQueryWithoutExecuting(query, maliciousProjectId);

      // Check for parameterization
      expect(result.query).not.toContain(maliciousProjectId);
      expect(result.parameters).toHaveProperty(
        "filter_project_id_1",
        maliciousProjectId,
      );
    });
  });

  describe("SQL Injection via Pagination Parameters", () => {
    it("should validate page and limit parameters", async () => {
      // Comment: Page and limit parameters can be used for SQL injection
      // if directly concatenated into LIMIT/OFFSET clauses
      const maliciousQuery: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        page: -1, // Potentially problematic negative value
        limit: 999999999, // Excessive limit
      };

      expect(() =>
        buildQueryWithoutExecuting(maliciousQuery, projectId),
      ).toThrow("Invalid query");
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
        page: 0,
        limit: 50,
      };

      // Expect the executeQuery function to throw a TRPC error
      // rather than allowing the injection
      await expect(executeQuery(projectId, maliciousQuery)).rejects.toThrow(
        TRPCError,
      );
    });
  });
});
