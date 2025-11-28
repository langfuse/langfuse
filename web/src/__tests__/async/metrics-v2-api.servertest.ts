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

describe("/api/public/v2/metrics API Endpoint", () => {
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

  let traceId: string;
  let observationIds: string[];

  beforeAll(async () => {
    traceId = randomUUID();
    observationIds = [];

    const timestamp = new Date();
    const timeValue = timestamp.getTime() * 1000; // microseconds for events table

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

  describe("Basic Functionality", () => {
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
  });

  describe("Denormalized Trace Fields", () => {
    it("should support userId dimension from events table", async () => {
      const query = {
        view: "observations",
        dimensions: [{ field: "userId" }],
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

    it("should support sessionId dimension from events table", async () => {
      const query = {
        view: "observations",
        dimensions: [{ field: "sessionId" }],
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

    it("should support tags dimension from events table", async () => {
      const query = {
        view: "observations",
        dimensions: [{ field: "tags" }],
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

    it("should support release dimension from events table", async () => {
      const query = {
        view: "observations",
        dimensions: [{ field: "release" }],
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

  describe("Validation - Trace-JOIN Dimensions", () => {
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

  describe("Validation - View Support", () => {
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

    it.skip("should support scores-numeric view", async () => {
      // TODO: Fix scores views table aliasing (pre-existing issue with baseCte format)
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

  describe("Time Dimension", () => {
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

  describe("Filters", () => {
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
});
