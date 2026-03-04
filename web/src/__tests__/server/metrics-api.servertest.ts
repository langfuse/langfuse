import { randomUUID } from "crypto";
import {
  makeZodVerifiedAPICall,
  makeZodVerifiedAPICallSilent,
  makeAPICall,
} from "@/src/__tests__/test-utils";
import { GetMetricsV1Response } from "@/src/features/public-api/types/metrics";
import { createBasicAuthHeader } from "@langfuse/shared/src/server";
import { type QueryType } from "@/src/features/query/types";
import {
  createTrace,
  createObservation,
  createTracesCh,
  createObservationsCh,
} from "@langfuse/shared/src/server";

describe("/api/public/metrics API Endpoint", () => {
  // Test setup variables
  const testTraces: Array<{
    id: string;
    name: string;
    timestamp: Date;
    metadata?: Record<string, any>;
  }> = [];
  const testMetadataValue = randomUUID();
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

  // Current time for traces
  const tomorrow = new Date(new Date().getTime() + 3600 * 24 * 1000);
  const now = new Date();
  const yesterday = new Date(new Date().getTime() - 3600 * 24 * 1000);
  const twoDaysAgo = new Date(new Date().getTime() - 3600 * 24 * 2 * 1000);

  // Set up test data before running tests
  beforeAll(async () => {
    // Create test traces with different names
    const trace1Id = randomUUID();
    const trace2Id = randomUUID();
    const trace3Id = randomUUID();

    // Create traces with different names and timestamps
    testTraces.push(
      {
        id: trace1Id,
        name: "trace-test-1",
        timestamp: now,
        metadata: { test: testMetadataValue },
      },
      {
        id: trace2Id,
        name: "trace-test-2",
        timestamp: yesterday,
        metadata: { test: testMetadataValue },
      },
      {
        id: trace3Id,
        name: "trace-test-3",
        timestamp: yesterday,
        metadata: { test: testMetadataValue },
      },
    );

    // Insert traces into database
    await createTracesCh(
      testTraces.map((trace) =>
        createTrace({
          id: trace.id,
          name: trace.name,
          project_id: projectId,
          timestamp: trace.timestamp.getTime(),
          metadata: trace.metadata || {},
        }),
      ),
    );

    // Create observations for trace1
    const trace1Observations = [];
    for (let i = 0; i < 3; i++) {
      trace1Observations.push(
        createObservation({
          id: randomUUID(),
          trace_id: trace1Id,
          project_id: projectId,
          name: `observation-${i}`,
          start_time: now.getTime(),
          metadata: { test: testMetadataValue },
        }),
      );
    }

    // Create observations for trace2
    const trace2Observations = [];
    for (let i = 0; i < 2; i++) {
      trace2Observations.push(
        createObservation({
          id: randomUUID(),
          trace_id: trace2Id,
          project_id: projectId,
          name: `observation-${i}`,
          start_time: yesterday.getTime(),
          metadata: { test: testMetadataValue },
        }),
      );
    }
    await createObservationsCh([...trace1Observations, ...trace2Observations]);
  });

  it.each([
    [
      "simple trace query",
      {
        view: "traces",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "count", aggregation: "count" }],
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
      } as QueryType,
      // Expected result structure (data will be dummy)
      {
        dataLength: 3,
        expectedMetrics: ["count_count"],
        expectedDimensions: ["name"],
      },
    ],
    [
      "query with time dimension",
      {
        view: "traces",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            column: "metadata",
            operator: "contains",
            key: "test",
            value: testMetadataValue,
            type: "stringObject",
          },
        ],
        timeDimension: {
          granularity: "day",
        },
        fromTimestamp: twoDaysAgo.toISOString(),
        toTimestamp: tomorrow.toISOString(),
        orderBy: null,
      } as QueryType,
      // Expected result structure
      {
        dataLength: 4,
        expectedMetrics: ["count_count"],
        expectedDimensions: ["time_dimension", "name"],
      },
    ],
    [
      "observations query with multiple metrics",
      {
        view: "observations",
        dimensions: [{ field: "name" }],
        metrics: [
          { measure: "count", aggregation: "count" },
          { measure: "latency", aggregation: "p95" },
        ],
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
      } as QueryType,
      // Expected result structure
      {
        dataLength: 3,
        expectedMetrics: ["count_count", "p95_latency"],
        expectedDimensions: ["name"],
      },
    ],
  ])(
    "should accept queries and return expected results: %s",
    async (
      _name: string,
      queryObject: QueryType,
      expectedResult: {
        dataLength: number;
        expectedMetrics: string[];
        expectedDimensions: string[];
      },
    ) => {
      // Add pagination parameters needed for the API
      const fullQuery = {
        ...queryObject,
        // page: 1,
        // limit: 10,
      };

      // Make the API call
      const response = await makeZodVerifiedAPICall(
        GetMetricsV1Response,
        "GET",
        `/api/public/metrics?query=${encodeURIComponent(JSON.stringify(fullQuery))}`,
      );

      // Validate response format
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);

      // Validate response matches expected structure
      expect(response.body.data).toHaveLength(expectedResult.dataLength);
      response.body.data.forEach((item) => {
        expect(
          expectedResult.expectedMetrics.every((metric) => metric in item),
        ).toBe(true);
        expect(
          expectedResult.expectedDimensions.every(
            (dimension) => dimension in item,
          ),
        ).toBe(true);
      });
    },
  );

  it("should return 401 with invalid authentication", async () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    // Create the query object
    const query = {
      view: "traces",
      metrics: [
        {
          measure: "totalCount",
          aggregation: "count",
        },
      ],
      fromTimestamp: yesterday.toISOString(),
      toTimestamp: now.toISOString(),
      page: 1,
      limit: 10,
    };

    const invalidAuth = createBasicAuthHeader(
      "invalid-project-key",
      "invalid-secret-key",
    );

    const { status } = await makeAPICall(
      "GET",
      `/api/public/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
      undefined,
      invalidAuth,
    );

    expect(status).toBe(401);
  });

  it("should return 400 for invalid query parameters", async () => {
    // Test missing required parameters by sending an invalid JSON string
    const { status } = await makeZodVerifiedAPICallSilent(
      GetMetricsV1Response,
      "GET",
      `/api/public/metrics?query=invalid-json-string`,
      undefined,
    );

    expect(status).toBe(400);
  });

  it("should return 400 for incomplete query object", async () => {
    // Missing required fields in the query object
    const incompleteQuery = {
      view: "traces",
      // Missing metrics, fromTimestamp, toTimestamp
    };

    const { status } = await makeZodVerifiedAPICallSilent(
      GetMetricsV1Response,
      "GET",
      `/api/public/metrics?query=${encodeURIComponent(JSON.stringify(incompleteQuery))}`,
      undefined,
    );

    expect(status).toBe(400);
  });

  it("should return 400 for invalid metric measure", async () => {
    // Build a query with an invalid metric measure (name)
    const invalidMetricNameQuery = {
      view: "traces",
      dimensions: [{ field: "name" }],
      metrics: [{ measure: "invalidMetric", aggregation: "count" }],
      fromTimestamp: new Date(
        new Date().getTime() - 3600 * 24 * 1000,
      ).toISOString(),
      toTimestamp: new Date().toISOString(),
    };

    const { status, body } = await makeAPICall(
      "GET",
      `/api/public/metrics?query=${encodeURIComponent(JSON.stringify(invalidMetricNameQuery))}`,
      undefined,
    );

    expect(status).toBe(400);
    expect(body).toHaveProperty("error");
    expect(body.message).toMatch(/Invalid metric/);
  });

  it("should return 400 for invalid metric aggregation", async () => {
    // Build a query with an invalid aggregation method
    const invalidAggregationQuery = {
      view: "traces",
      dimensions: [{ field: "name" }],
      metrics: [{ measure: "count", aggregation: "invalidAggregation" }],
      fromTimestamp: new Date(
        new Date().getTime() - 3600 * 24 * 1000,
      ).toISOString(),
      toTimestamp: new Date().toISOString(),
    };

    const { status, body } = await makeAPICall(
      "GET",
      `/api/public/metrics?query=${encodeURIComponent(JSON.stringify(invalidAggregationQuery))}`,
      undefined,
    );

    expect(status).toBe(400);
    expect(body).toHaveProperty("error");
    expect(body.message).toMatch(/Invalid request data/);
  });

  it("should return 400 for invalid dimension", async () => {
    // Build a query with an invalid dimension
    const invalidDimensionQuery = {
      view: "traces",
      dimensions: [{ field: "nonExistentDimension" }],
      metrics: [{ measure: "count", aggregation: "count" }],
      fromTimestamp: new Date(
        new Date().getTime() - 3600 * 24 * 1000,
      ).toISOString(),
      toTimestamp: new Date().toISOString(),
    };

    const { status, body } = await makeAPICall(
      "GET",
      `/api/public/metrics?query=${encodeURIComponent(JSON.stringify(invalidDimensionQuery))}`,
      undefined,
    );

    expect(status).toBe(400);
    expect(body).toHaveProperty("error");
    expect(body.message).toMatch(/Invalid dimension/);
  });

  it("should return 400 for invalid filter column", async () => {
    // Build a query with an invalid filter column
    const invalidFilterQuery = {
      view: "traces",
      dimensions: [{ field: "name" }],
      metrics: [{ measure: "count", aggregation: "count" }],
      filters: [
        {
          column: "nonExistentColumn",
          operator: "=",
          value: "test",
          type: "string",
        },
      ],
      fromTimestamp: new Date(
        new Date().getTime() - 3600 * 24 * 1000,
      ).toISOString(),
      toTimestamp: new Date().toISOString(),
    };

    const { status, body } = await makeAPICall(
      "GET",
      `/api/public/metrics?query=${encodeURIComponent(JSON.stringify(invalidFilterQuery))}`,
      undefined,
    );

    expect(status).toBe(400);
    expect(body).toHaveProperty("error");
    expect(body.message).toMatch(/Invalid filter column/);
  });

  it("should handle histogram aggregation with custom bin count", async () => {
    // Create test data with varying costs for histogram
    const histogramTraceId = randomUUID();

    // Create a trace for histogram testing
    await createTracesCh([
      createTrace({
        id: histogramTraceId,
        name: "histogram-test-trace",
        project_id: projectId,
        timestamp: now.getTime(),
        metadata: { test: testMetadataValue },
      }),
    ]);

    // Create observations with varying costs to test histogram
    const histogramObservations: ReturnType<typeof createObservation>[] = [];
    const costValues = [
      // Low cost cluster - 5 observations
      0.001, 0.002, 0.003, 0.004, 0.005,
      // Medium cost cluster - 5 observations
      0.05, 0.06, 0.07, 0.08, 0.09,
      // High cost cluster - 5 observations
      0.5, 0.6, 0.7, 0.8, 0.9,
    ];

    costValues.forEach((cost, index) => {
      histogramObservations.push(
        createObservation({
          id: randomUUID(),
          trace_id: histogramTraceId,
          project_id: projectId,
          name: `histogram-observation-${index}`,
          start_time: now.getTime(),
          total_cost: cost,
          metadata: { test: testMetadataValue },
        }),
      );
    });

    await createObservationsCh(histogramObservations);

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
      `/api/public/metrics?query=${encodeURIComponent(JSON.stringify(histogramQuery))}`,
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

  describe("LFE-6148: Comprehensive filter validation", () => {
    it("should return 400 error for invalid array field filters", async () => {
      // Test using string type on array field (tags) - should return validation error
      const invalidStringTypeQuery = {
        view: "traces",
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
        fromTimestamp: yesterday.toISOString(),
        toTimestamp: tomorrow.toISOString(),
        orderBy: null,
      };

      // Make API call and expect 400 error
      const response = await makeAPICall(
        "GET",
        `/api/public/metrics?query=${encodeURIComponent(JSON.stringify(invalidStringTypeQuery))}`,
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
        view: "traces",
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
        fromTimestamp: yesterday.toISOString(),
        toTimestamp: tomorrow.toISOString(),
        orderBy: null,
      };

      const response = await makeAPICall(
        "GET",
        `/api/public/metrics?query=${encodeURIComponent(JSON.stringify(invalidMetadataTypeQuery))}`,
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
      // Setup test data with tags
      const taggedTraceId = randomUUID();
      await createTracesCh([
        createTrace({
          id: taggedTraceId,
          name: "tagged-trace",
          project_id: projectId,
          timestamp: now.getTime(),
          tags: ["test-tag", "another-tag"],
          metadata: { test: testMetadataValue },
        }),
      ]);

      // Test with correct arrayOptions filter
      const validQuery = {
        view: "traces",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            column: "tags",
            operator: "any of", // Correct operator for array fields
            value: ["test-tag"],
            type: "arrayOptions", // Correct type for array fields
          },
          {
            column: "metadata",
            operator: "contains",
            key: "test",
            value: testMetadataValue,
            type: "stringObject",
          },
        ],
        timeDimension: null,
        fromTimestamp: yesterday.toISOString(),
        toTimestamp: tomorrow.toISOString(),
        orderBy: null,
      };

      // Make the API call
      const response = await makeZodVerifiedAPICall(
        GetMetricsV1Response,
        "GET",
        `/api/public/metrics?query=${encodeURIComponent(JSON.stringify(validQuery))}`,
      );

      // Should succeed and return data
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);

      // Verify we got the tagged trace
      const taggedTraceResult = response.body.data.find(
        (row: any) => row.name === "tagged-trace",
      );
      expect(taggedTraceResult).toBeDefined();
      expect(Number(taggedTraceResult.count_count)).toBe(1);
    });
  });
});
