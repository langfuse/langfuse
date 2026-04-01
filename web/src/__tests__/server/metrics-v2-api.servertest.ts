import { randomUUID } from "crypto";
import {
  makeZodVerifiedAPICall,
  makeAPICall,
} from "@/src/__tests__/test-utils";
import { GetMetricsV1Response } from "@/src/features/public-api/types/metrics";
import {
  createEvent,
  createEventsCh,
  createScoresCh,
  createTraceScore,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import waitForExpect from "wait-for-expect";

const hasV2Apis = env.LANGFUSE_ENABLE_EVENTS_TABLE_V2_APIS === "true";
const maybe = hasV2Apis ? describe : describe.skip;

describe("/api/public/v2/metrics API Endpoint", () => {
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

  let traceId: string;
  let observationIds: string[];

  const timestamp = new Date();
  const timeValue = timestamp.getTime() * 1000; // microseconds for events table
  const testMetadataValue = randomUUID();

  beforeAll(async () => {
    if (!hasV2Apis) {
      // don't attempt data setup if events table is disabled
      return;
    }

    traceId = randomUUID();
    observationIds = [];

    // Create observations in events table
    const observations = [];
    for (let i = 0; i < 5; i++) {
      const obsId = randomUUID();
      observationIds.push(obsId);

      observations.push(
        createEvent({
          id: obsId,
          span_id: obsId,
          trace_id: traceId,
          project_id: projectId,
          type: i % 2 === 0 ? "GENERATION" : "SPAN",
          name: `v2-test-observation-${i}`,
          level: "DEFAULT",
          start_time: timeValue + i * 1000000, // Spread over 5 seconds
          end_time: timeValue + (i + 1) * 1000000,
          provided_model_name: i % 2 === 0 ? "gpt-4" : null,
          user_id: "test-user-v2",
          session_id: "test-session-v2",
          tags: ["v2-test", "events-table"],
          release: "v2.0.0",
          usage_details: {
            input: 100 * (i + 1),
            output: 50 * (i + 1),
            total: 150 * (i + 1),
          },
          cost_details: {
            input: 0.001 * (i + 1),
            output: 0.002 * (i + 1),
          },
          total_cost: 0.003 * (i + 1),
        }),
      );
    }

    await createEventsCh(observations);

    // Wait for ClickHouse to process
    await waitForExpect(
      async () => {
        const result = await queryClickhouse<{ count: string }>({
          query: `SELECT count() as count FROM events_core WHERE project_id = {projectId: String} AND span_id IN ({ids: Array(String)})`,
          params: { projectId, ids: observationIds },
        });
        expect(Number(result[0]?.count)).toBeGreaterThanOrEqual(
          observationIds.length,
        );
      },
      5000,
      10,
    );
  });

  it("should kill redis connection", () => {
    // we need at least one test case to avoid hanging
    // redis connection when everything else is skipped.
  });

  maybe("Basic Functionality", () => {
    it("should apply default row_limit of 100 when not specified", async () => {
      // Create enough observations to exceed default limit
      const rowLimitTraceId = randomUUID();
      const rowLimitObservations = Array.from({ length: 150 }, (_, i) =>
        createEvent({
          id: randomUUID(),
          span_id: randomUUID(),
          trace_id: rowLimitTraceId,
          project_id: projectId,
          type: "SPAN",
          name: `row-limit-test-observation-${i}`,
          start_time: timeValue + i * 1000,
        }),
      );

      await createEventsCh(rowLimitObservations);

      // Query without specifying row_limit - should default to 100
      const query = {
        view: "observations",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            column: "traceId",
            operator: "=",
            value: rowLimitTraceId,
            type: "string",
          },
        ],
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date().toISOString(),
      };

      const response = await makeZodVerifiedAPICall(
        GetMetricsV1Response,
        "GET",
        `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      // Should be limited to 100 rows (default) despite having 150 observations
      expect(response.body.data.length).toBeLessThanOrEqual(100);
    });

    it("should respect custom row_limit when specified", async () => {
      // Create observations for this test
      const customLimitTraceId = randomUUID();
      const customLimitObservations = Array.from({ length: 20 }, (_, i) =>
        createEvent({
          id: randomUUID(),
          span_id: randomUUID(),
          trace_id: customLimitTraceId,
          project_id: projectId,
          type: "SPAN",
          name: `custom-limit-observation-${i}`,
          start_time: timeValue + i * 1000,
        }),
      );

      await createEventsCh(customLimitObservations);

      // Query with custom row_limit of 5
      const query = {
        view: "observations",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            column: "traceId",
            operator: "=",
            value: customLimitTraceId,
            type: "string",
          },
        ],
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date().toISOString(),
        config: { row_limit: 5 },
      };

      const response = await makeZodVerifiedAPICall(
        GetMetricsV1Response,
        "GET",
        `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      // Should be limited to 5 rows as specified
      expect(response.body.data.length).toBeLessThanOrEqual(5);
    });

    it("should return correct count metrics", async () => {
      const query = {
        view: "observations",
        metrics: [{ measure: "count", aggregation: "count" }],
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date().toISOString(),
      };

      const response = await makeZodVerifiedAPICall(
        GetMetricsV1Response,
        "GET",
        `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it("should support latency metrics with microsecond to millisecond conversion", async () => {
      const query = {
        view: "observations",
        metrics: [{ measure: "latency", aggregation: "avg" }],
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date().toISOString(),
      };

      const response = await makeZodVerifiedAPICall(
        GetMetricsV1Response,
        "GET",
        `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      // Latency should be in milliseconds (around 1000ms based on our test data)
      if (response.body.data.length > 0) {
        const avgLatency = response.body.data[0].avg_latency as number;
        expect(avgLatency).toBeGreaterThan(0);
        expect(avgLatency).toBeLessThan(10000); // Should be reasonable milliseconds
      }
    });

    it("should support cost and token metrics", async () => {
      const query = {
        view: "observations",
        metrics: [
          { measure: "totalCost", aggregation: "sum" },
          { measure: "totalTokens", aggregation: "sum" },
        ],
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date().toISOString(),
      };

      const response = await makeZodVerifiedAPICall(
        GetMetricsV1Response,
        "GET",
        `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
    });

    it("should handle histogram aggregation with custom bin count", async () => {
      const histogramTraceId = randomUUID();

      // Create observations with varying costs to test histogram
      const histogramObservations: Array<ReturnType<typeof createEvent>> = [];
      const costValues = [
        // Low cost cluster - 5 observations
        0.001, 0.002, 0.003, 0.004, 0.005,
        // Medium cost cluster - 5 observations
        0.05, 0.06, 0.07, 0.08, 0.09,
        // High cost cluster - 5 observations
        0.5, 0.6, 0.7, 0.8, 0.9,
      ];

      costValues.forEach((cost, index) => {
        const obsId = randomUUID();
        histogramObservations.push(
          createEvent({
            id: obsId,
            span_id: obsId,
            trace_id: histogramTraceId,
            project_id: projectId,
            name: `histogram-observation-${index}`,
            type: "GENERATION",
            start_time: timeValue,
            total_cost: cost,
            metadata_names: ["test"],
            metadata_values: [testMetadataValue],
          }),
        );
      });

      await createEventsCh(
        histogramObservations as ReturnType<typeof createEvent>[],
      );

      const twoDaysAgo = new Date(new Date().getTime() - 3600 * 24 * 2 * 1000);
      const tomorrow = new Date(new Date().getTime() + 3600 * 24 * 1000);

      // Test histogram query with custom bin count
      const histogramQuery = {
        view: "observations",
        dimensions: [],
        metrics: [{ measure: "totalCost", aggregation: "histogram" }],
        filters: [
          {
            column: "metadata",
            operator: "contains",
            key: "test",
            value: testMetadataValue,
            type: "stringObject",
          },
        ],
        timeDimension: null,
        fromTimestamp: twoDaysAgo.toISOString(),
        toTimestamp: tomorrow.toISOString(),
        orderBy: null,
        config: { bins: 15 },
      };

      // Make the API call
      const response = await makeZodVerifiedAPICall(
        GetMetricsV1Response,
        "GET",
        `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(histogramQuery))}`,
      );

      // Validate response format
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data).toHaveLength(1);

      // Validate histogram data structure
      const histogramData = response.body.data[0].histogram_totalCost as [
        number,
        number,
        number,
      ][];
      expect(Array.isArray(histogramData)).toBe(true);
      expect(histogramData.length).toBeGreaterThan(0);
      expect(histogramData.length).toBeLessThanOrEqual(15); // Should not exceed requested bins

      // Verify histogram tuple structure [lower, upper, height]
      histogramData.forEach((bin: [number, number, number]) => {
        expect(Array.isArray(bin)).toBe(true);
        expect(bin).toHaveLength(3);
        const [lower, upper, height] = bin;
        expect(typeof lower).toBe("number");
        expect(typeof upper).toBe("number");
        expect(typeof height).toBe("number");
        expect(lower).toBeLessThanOrEqual(upper);
        expect(height).toBeGreaterThanOrEqual(0);
      });
    });
  });

  maybe("Denormalized Trace Fields", () => {
    it.each([["tags"], ["release"]])(
      "Denormalized field: %s",
      async (field) => {
        const query = {
          view: "observations",
          dimensions: [{ field }],
          metrics: [{ measure: "count", aggregation: "count" }],
          fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
          toTimestamp: new Date().toISOString(),
        };

        const response = await makeZodVerifiedAPICall(
          GetMetricsV1Response,
          "GET",
          `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
        );

        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();
        expect(response.body.data.length).toBeGreaterThan(0);
        expect(
          response.body.data.filter((x) =>
            x.count_count && x[field] ? (x.count_count as number) > 0 : false,
          ).length,
        ).toBeGreaterThan(0);
      },
    );

    it("should support multiple denormalized dimensions together", async () => {
      const query = {
        view: "observations",
        dimensions: [{ field: "tags" }, { field: "release" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date().toISOString(),
      };

      const response = await makeZodVerifiedAPICall(
        GetMetricsV1Response,
        "GET",
        `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
    });
  });

  maybe("High Cardinality Dimension Validation", () => {
    it.each([
      ["id", "observations"],
      ["traceId", "observations"],
      ["userId", "observations"],
      ["sessionId", "observations"],
      ["parentObservationId", "observations"],
      ["id", "scores-numeric"],
      ["traceId", "scores-numeric"],
      ["userId", "scores-numeric"],
      ["sessionId", "scores-numeric"],
      ["observationId", "scores-numeric"],
    ])(
      "should reject high cardinality dimension %s in %s view without LIMIT and ORDER DESC",
      async (dimensionField, viewName) => {
        const query = {
          view: viewName,
          dimensions: [{ field: dimensionField }],
          metrics: [{ measure: "count", aggregation: "count" }],
          fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
          toTimestamp: new Date().toISOString(),
        };

        const response = await makeAPICall(
          "GET",
          `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
        );

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          error: "InvalidRequestError",
          message: expect.stringContaining(
            `require both 'config.row_limit' and 'orderBy' with direction 'desc'`,
          ),
        });
      },
    );

    it("should reject high cardinality dimension without LIMIT", async () => {
      const query = {
        view: "observations",
        dimensions: [{ field: "traceId" }],
        metrics: [{ measure: "latency", aggregation: "sum" }],
        orderBy: [{ field: "sum_latency", direction: "desc" }],
        // Missing config.row_limit
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date().toISOString(),
      };

      const response = await makeAPICall(
        "GET",
        `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
      );

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: "InvalidRequestError",
        message: expect.stringContaining(
          `require both 'config.row_limit' and 'orderBy' with direction 'desc'`,
        ),
      });
    });

    it("should allow high cardinality fields in filters", async () => {
      const query = {
        view: "observations",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            column: "traceId",
            operator: "=",
            value: traceId,
            type: "string",
          },
        ],
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date().toISOString(),
      };

      const response = await makeZodVerifiedAPICall(
        GetMetricsV1Response,
        "GET",
        `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
    });
  });

  maybe("Validation - Backwards-Compatible Trace Dimensions", () => {
    it.each([["traceName"], ["traceRelease"], ["traceVersion"]])(
      "should support %s dimension",
      async (dimensionField) => {
        const query = {
          view: "observations",
          dimensions: [{ field: dimensionField }],
          metrics: [{ measure: "count", aggregation: "count" }],
          fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
          toTimestamp: new Date().toISOString(),
        };

        const response = await makeZodVerifiedAPICall(
          GetMetricsV1Response,
          "GET",
          `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
        );

        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();
      },
    );
  });

  maybe("Validation - View Support", () => {
    it("should reject traces view with 400 error - traces not supported in v2 API", async () => {
      const query = {
        view: "traces",
        metrics: [{ measure: "count", aggregation: "count" }],
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date().toISOString(),
      };

      const response = await makeAPICall(
        "GET",
        `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
      );

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid request data");
      expect(response.body.error).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ["query", "view"],
            message: expect.stringContaining("observations"),
          }),
        ]),
      );
    });

    it("should support scores-numeric view", async () => {
      const query = {
        view: "scores-numeric",
        metrics: [{ measure: "count", aggregation: "count" }],
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date().toISOString(),
      };

      const response = await makeZodVerifiedAPICall(
        GetMetricsV1Response,
        "GET",
        `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
      );

      expect(response.status).toBe(200);
    });
  });

  maybe("Time Dimension", () => {
    it("should support time dimension with granularity", async () => {
      const query = {
        view: "observations",
        metrics: [{ measure: "count", aggregation: "count" }],
        timeDimension: { granularity: "day" },
        fromTimestamp: new Date(Date.now() - 86400000 * 7).toISOString(),
        toTimestamp: new Date().toISOString(),
      };

      const response = await makeZodVerifiedAPICall(
        GetMetricsV1Response,
        "GET",
        `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
    });
  });

  maybe("Filters", () => {
    it("should support filtering by observation-level dimensions", async () => {
      const query = {
        view: "observations",
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            column: "type",
            operator: "=",
            value: "GENERATION",
            type: "string",
          },
        ],
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date().toISOString(),
      };

      const response = await makeZodVerifiedAPICall(
        GetMetricsV1Response,
        "GET",
        `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
    });

    it("should support filtering by denormalized userId", async () => {
      const query = {
        view: "observations",
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            column: "userId",
            operator: "=",
            value: "test-user-v2",
            type: "string",
          },
        ],
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date().toISOString(),
      };

      const response = await makeZodVerifiedAPICall(
        GetMetricsV1Response,
        "GET",
        `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
    });
  });

  maybe("LFE-6148: Comprehensive filter validation", () => {
    it("should return 400 error for invalid array field filters", async () => {
      // Test using string type on array field (tags) - should return validation error
      const invalidStringTypeQuery = {
        view: "observations",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            column: "tags",
            operator: "contains",
            value: "test-tag",
            type: "string", // Invalid: array fields require arrayOptions type
          },
        ],
        timeDimension: {
          granularity: "day",
        },
        fromTimestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
        toTimestamp: new Date().toISOString(),
        orderBy: null,
      };

      // Make API call and expect 400 error
      const response = await makeAPICall(
        "GET",
        `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(invalidStringTypeQuery))}`,
      );

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: "InvalidRequestError",
        message: expect.stringContaining(
          "Array fields require type 'arrayOptions', not 'string'",
        ),
      });
    });

    it("should return 400 error for invalid metadata filters", async () => {
      // Test using wrong type for metadata field
      const invalidMetadataTypeQuery = {
        view: "observations",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            column: "metadata",
            operator: "contains",
            value: "test-value",
            type: "string", // Invalid: metadata requires stringObject type
          },
        ],
        timeDimension: null,
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date().toISOString(),
        orderBy: null,
      };

      const response = await makeAPICall(
        "GET",
        `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(invalidMetadataTypeQuery))}`,
      );

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: "InvalidRequestError",
        message: expect.stringContaining(
          "Metadata filters require type 'stringObject'",
        ),
      });
    });

    it("should work correctly with proper array field filter configuration", async () => {
      // Create observation with tags for this test
      const taggedObsId = randomUUID();
      const taggedTraceId = randomUUID();

      await createEventsCh([
        createEvent({
          id: taggedObsId,
          span_id: taggedObsId,
          trace_id: taggedTraceId,
          project_id: projectId,
          type: "SPAN",
          name: "tagged-observation",
          start_time: Date.now() * 1000,
          tags: ["v2-filter-test", "array-test"],
          user_id: "filter-test-user",
        }),
      ]);

      // Test with correct arrayOptions filter on observations view
      const validQuery = {
        view: "observations",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            column: "tags",
            operator: "any of", // Correct operator for array fields
            value: ["v2-filter-test"],
            type: "arrayOptions", // Correct type for array fields
          },
        ],
        timeDimension: null,
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date().toISOString(),
        orderBy: null,
      };

      // Make the API call
      const response = await makeZodVerifiedAPICall(
        GetMetricsV1Response,
        "GET",
        `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(validQuery))}`,
      );

      // Should succeed and return data
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);

      // Verify we got the tagged observation
      const taggedObsResult = response.body.data.find(
        (row: any) => row.name === "tagged-observation",
      );
      expect(taggedObsResult).toBeDefined();
      expect(Number(taggedObsResult?.count_count)).toBeGreaterThanOrEqual(1);
    });
  });

  maybe("Scores Views - Denormalized Fields", () => {
    const scoreTraceId = randomUUID();
    const scoreIds: string[] = [];
    const scoreObservationId = randomUUID();
    const scoreSessionId = randomUUID();

    beforeAll(async () => {
      if (!hasV2Apis) return;

      // Create observation in events table for scores to reference
      await createEventsCh([
        createEvent({
          id: scoreObservationId,
          span_id: scoreObservationId,
          trace_id: scoreTraceId,
          project_id: projectId,
          name: "test-observation-for-scores",
          start_time: Date.now() * 1000,
          session_id: scoreSessionId,
        }),
      ]);

      const scores = [];
      for (let i = 0; i < 3; i++) {
        const scoreId = randomUUID();
        scoreIds.push(scoreId);

        scores.push({
          ...createTraceScore({
            id: scoreId,
            project_id: projectId,
            trace_id: scoreTraceId,
            observation_id: scoreObservationId,
            name: `test-score-${i}`,
            value: i * 10,
            data_type: "NUMERIC",
            timestamp: Date.now() + i * 1000,
          }),
          session_id: scoreSessionId,
        });
      }

      await createScoresCh(scores);

      // Wait for ClickHouse to process
      await waitForExpect(
        async () => {
          const result = await queryClickhouse<{ count: string }>({
            query: `SELECT count() as count FROM scores WHERE project_id = {projectId: String} AND id IN ({ids: Array(String)})`,
            params: { projectId, ids: scoreIds },
          });
          expect(Number(result[0]?.count)).toBeGreaterThanOrEqual(
            scoreIds.length,
          );
        },
        5000,
        10,
      );
    });

    it("should support filtering by sessionId from scores table", async () => {
      const query = {
        view: "scores-numeric",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            column: "sessionId",
            operator: "=",
            value: scoreSessionId,
            type: "string",
          },
        ],
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date().toISOString(),
      };

      const response = await makeZodVerifiedAPICall(
        GetMetricsV1Response,
        "GET",
        `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it("should support filtering by sessionId", async () => {
      const query = {
        view: "scores-numeric",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            column: "sessionId",
            operator: "=",
            value: scoreSessionId,
            type: "string",
          },
        ],
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date().toISOString(),
      };

      const response = await makeZodVerifiedAPICall(
        GetMetricsV1Response,
        "GET",
        `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it("should support value aggregations for numeric scores", async () => {
      const query = {
        view: "scores-numeric",
        metrics: [
          { measure: "value", aggregation: "avg" },
          { measure: "value", aggregation: "max" },
          { measure: "value", aggregation: "min" },
        ],
        filters: [
          {
            column: "sessionId",
            operator: "=",
            value: scoreSessionId,
            type: "string",
          },
        ],
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date().toISOString(),
      };

      const response = await makeZodVerifiedAPICall(
        GetMetricsV1Response,
        "GET",
        `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);

      const data = response.body.data[0];
      expect(data.avg_value).toBeDefined();
      expect(data.max_value).toBeDefined();
      expect(data.min_value).toBeDefined();
    });
  });

  maybe("Scores Views - Denormalized Trace Fields via Events", () => {
    let eventsScoreTraceId: string;
    let eventsObservationId: string;
    let eventsScoreId: string;
    const eventsScoreSessionId = "events-score-session";
    const eventsScoreUserId = "events-score-user";
    const eventsScoreTags = ["events-tag-1", "events-tag-2"];
    const eventsScoreRelease = "events-v3.0.0";
    const eventsScoreTraceName = "events-trace-name";
    const eventsScoreVersion = "events-v1.2.3";

    beforeAll(async () => {
      if (!hasV2Apis) return;

      eventsScoreTraceId = randomUUID();
      eventsObservationId = randomUUID();
      eventsScoreId = randomUUID();

      // Create observation in events table (v2 source)
      await createEventsCh([
        createEvent({
          id: eventsObservationId,
          span_id: eventsObservationId,
          trace_id: eventsScoreTraceId,
          project_id: projectId,
          trace_name: eventsScoreTraceName,
          name: "test-observation-for-score",
          provided_model_name: "gpt-4-turbo",
          start_time: Date.now() * 1000,
          user_id: eventsScoreUserId,
          session_id: eventsScoreSessionId,
          tags: eventsScoreTags,
          release: eventsScoreRelease,
          version: eventsScoreVersion,
        }),
      ]);

      await createScoresCh([
        createTraceScore({
          id: eventsScoreId,
          project_id: projectId,
          trace_id: eventsScoreTraceId,
          observation_id: eventsObservationId,
          session_id: eventsScoreSessionId,
          name: "score-with-events",
          value: 95,
          data_type: "NUMERIC",
          timestamp: Date.now(),
        }),
      ]);

      // Wait for ClickHouse to process
      await waitForExpect(
        async () => {
          const result = await queryClickhouse<{ count: string }>({
            query: `SELECT count() as count FROM scores WHERE project_id = {projectId: String} AND id IN ({ids: Array(String)})`,
            params: { projectId, ids: [eventsScoreId] },
          });
          expect(Number(result[0]?.count)).toBeGreaterThanOrEqual(1);
        },
        5000,
        10,
      );
    });

    it.each([
      [
        "traceName",
        eventsScoreTraceName,
        (row: any) => row.traceName === eventsScoreTraceName,
      ],
      ["tags", eventsScoreTags, (row: any) => Array.isArray(row.tags)],
      [
        "traceRelease",
        eventsScoreRelease,
        (row: any) => row.traceRelease === eventsScoreRelease,
      ],
      [
        "traceVersion",
        eventsScoreVersion,
        (row: any) => row.traceVersion === eventsScoreVersion,
      ],
    ])(
      "should support %s dimension via events JOIN",
      async (dimensionField, expectedValue, findRowFn) => {
        const query = {
          view: "scores-numeric",
          dimensions: [{ field: dimensionField }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [
            {
              column: "name",
              operator: "=",
              value: "score-with-events",
              type: "string",
            },
          ],
          fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
          toTimestamp: new Date().toISOString(),
        };

        const response = await makeZodVerifiedAPICall(
          GetMetricsV1Response,
          "GET",
          `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
        );

        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();

        if (dimensionField === "tags") {
          expect(response.body.data.length).toBeGreaterThan(0);
        } else {
          const foundRow = response.body.data.find(findRowFn);
          expect(foundRow).toBeDefined();
        }
      },
    );
  });

  maybe("Scores Views - Observation Dimensions via Events", () => {
    let obsEventsTraceId: string;
    let obsEventsObservationId: string;
    let obsEventsScoreId: string;

    beforeAll(async () => {
      if (!hasV2Apis) return;

      obsEventsTraceId = randomUUID();
      obsEventsObservationId = randomUUID();
      obsEventsScoreId = randomUUID();

      await createEventsCh([
        createEvent({
          id: obsEventsObservationId,
          span_id: obsEventsObservationId,
          trace_id: obsEventsTraceId,
          project_id: projectId,
          name: "test-observation-for-score-v2",
          provided_model_name: "gpt-4-turbo",
          start_time: Date.now() * 1000,
        }),
      ]);

      await createScoresCh([
        createTraceScore({
          id: obsEventsScoreId,
          project_id: projectId,
          trace_id: obsEventsTraceId,
          observation_id: obsEventsObservationId,
          session_id: "obs-events-test-session",
          name: "score-with-observation-v2",
          value: 95,
          data_type: "NUMERIC",
          timestamp: Date.now(),
        }),
      ]);

      // Wait for ClickHouse to process
      await waitForExpect(
        async () => {
          const result = await queryClickhouse<{ count: string }>({
            query: `SELECT count() as count FROM scores WHERE project_id = {projectId: String} AND id IN ({ids: Array(String)})`,
            params: { projectId, ids: [obsEventsScoreId] },
          });
          expect(Number(result[0]?.count)).toBeGreaterThanOrEqual(1);
        },
        5000,
        10,
      );
    });

    it.each([
      [
        "observationModelName",
        "gpt-4-turbo",
        (row: any) => row.observationModelName === "gpt-4-turbo",
      ],
      [
        "observationName",
        "test-observation-for-score-v2",
        (row: any) => row.observationName === "test-observation-for-score-v2",
      ],
    ])(
      "should support %s dimension via events table",
      async (dimensionField, expectedValue, findRowFn) => {
        const query = {
          view: "scores-numeric",
          dimensions: [{ field: dimensionField }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [
            {
              column: "name",
              operator: "=",
              value: "score-with-observation-v2",
              type: "string",
            },
          ],
          fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
          toTimestamp: new Date().toISOString(),
        };

        const response = await makeZodVerifiedAPICall(
          GetMetricsV1Response,
          "GET",
          `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
        );

        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();

        // Should be able to access observation fields via events table JOIN
        const foundRow = response.body.data.find(findRowFn);
        expect(foundRow).toBeDefined();
      },
    );
  });
});
