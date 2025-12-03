import { randomUUID } from "crypto";
import {
  makeZodVerifiedAPICall,
  makeAPICall,
} from "@/src/__tests__/test-utils";
import { GetMetricsV2Response } from "@/src/features/public-api/types/metrics";
import {
  createEvent,
  createTrace,
  createTracesCh,
  createEventsCh,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";

const hasEvents = env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true";
const maybe = hasEvents ? describe : describe.skip;

describe("/api/public/v2/metrics API Endpoint", () => {
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

  let traceId: string;
  let observationIds: string[];

  const timestamp = new Date();
  const timeValue = timestamp.getTime() * 1000; // microseconds for events table
  const testMetadataValue = randomUUID();

  beforeAll(async () => {
    if (!hasEvents) {
      // don't attempt data setup if events table is disabled
      return;
    }

    traceId = randomUUID();
    observationIds = [];

    // Create trace in ClickHouse
    const trace = createTrace({
      id: traceId,
      project_id: projectId,
      user_id: "test-user-v2",
      session_id: "test-session-v2",
      tags: ["v2-test", "events-table"],
      release: "v2.0.0",
    });
    await createTracesCh([trace]);

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

    // Wait a bit for ClickHouse to process
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  it("should kill redis connection", () => {
    // we need at least one test case to avoid hanging
    // redis connection when everything else is skipped.
  });

  maybe("Basic Functionality", () => {
    it("should return correct count metrics", async () => {
      const query = {
        view: "observations",
        metrics: [{ measure: "count", aggregation: "count" }],
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date().toISOString(),
      };

      const response = await makeZodVerifiedAPICall(
        GetMetricsV2Response,
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
        GetMetricsV2Response,
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
        GetMetricsV2Response,
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
            metadata_raw_values: [testMetadataValue],
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
        GetMetricsV2Response,
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
    ["traceId", "userId", "sessionId", "tags", "release"].forEach((field) => {
      it(`should support ${field} dimension from events table`, async () => {
        const query = {
          view: "observations",
          dimensions: [{ field }],
          metrics: [{ measure: "count", aggregation: "count" }],
          fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
          toTimestamp: new Date().toISOString(),
        };

        const response = await makeZodVerifiedAPICall(
          GetMetricsV2Response,
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
      });
    });

    it("should support multiple denormalized dimensions together", async () => {
      const query = {
        view: "observations",
        dimensions: [
          { field: "userId" },
          { field: "sessionId" },
          { field: "tags" },
        ],
        metrics: [{ measure: "count", aggregation: "count" }],
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date().toISOString(),
      };

      const response = await makeZodVerifiedAPICall(
        GetMetricsV2Response,
        "GET",
        `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
    });
  });

  maybe("Validation - Trace-JOIN Dimensions", () => {
    it("should reject traceName dimension (requires traces JOIN)", async () => {
      const query = {
        view: "observations",
        dimensions: [{ field: "traceName" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date().toISOString(),
      };

      const response = await makeAPICall(
        "GET",
        `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
      );

      expect(response.status).toBe(400);
      // Zod validation returns generic "Invalid request data"
      expect(response.body.message).toContain("Invalid request data");
    });

    it("should reject traceRelease dimension (requires traces JOIN)", async () => {
      const query = {
        view: "observations",
        dimensions: [{ field: "traceRelease" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date().toISOString(),
      };

      const response = await makeAPICall(
        "GET",
        `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
      );

      expect(response.status).toBe(400);
      // Zod validation returns generic "Invalid request data"
      expect(response.body.message).toContain("Invalid request data");
    });

    it("should reject traceVersion dimension (requires traces JOIN)", async () => {
      const query = {
        view: "observations",
        dimensions: [{ field: "traceVersion" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date().toISOString(),
      };

      const response = await makeAPICall(
        "GET",
        `/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
      );

      expect(response.status).toBe(400);
      // Zod validation returns generic "Invalid request data"
      expect(response.body.message).toContain("Invalid request data");
    });
  });

  maybe("Validation - View Support", () => {
    it("should reject traces view (not supported in V2)", async () => {
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
    });

    it("should support scores-numeric view", async () => {
      const query = {
        view: "scores-numeric",
        metrics: [{ measure: "count", aggregation: "count" }],
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date().toISOString(),
      };

      const response = await makeZodVerifiedAPICall(
        GetMetricsV2Response,
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
        GetMetricsV2Response,
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
        GetMetricsV2Response,
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
        GetMetricsV2Response,
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

      await createTracesCh([
        createTrace({
          id: taggedTraceId,
          name: "tagged-observation-trace",
          project_id: projectId,
          timestamp: Date.now(),
          tags: ["v2-filter-test", "array-test"],
        }),
      ]);

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
        GetMetricsV2Response,
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
      expect(Number(taggedObsResult.count_count)).toBeGreaterThanOrEqual(1);
    });
  });
});
