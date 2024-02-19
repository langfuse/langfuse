import { makeAPICall, pruneDatabase } from "@/src/__tests__/test-utils";
import { v4 as uuidv4 } from "uuid";

describe("/api/public/metrics/daily API Endpoint", () => {
  beforeEach(async () => await pruneDatabase());
  afterEach(async () => await pruneDatabase());

  it("should handle daily metrics correctly", async () => {
    await pruneDatabase();

    // Create traces with observations on different days
    const traceId1 = uuidv4();
    const traceId2 = uuidv4();
    await makeAPICall("POST", "/api/public/traces", {
      id: traceId1,
      timestamp: "2021-01-01T00:00:00.000Z",
      name: "trace-day-1",
      userId: "user-daily-metrics",
      projectId: "project-daily-metrics",
    });
    await makeAPICall("POST", "/api/public/traces", {
      id: traceId2,
      timestamp: "2021-01-02T00:00:00.000Z",
      name: "trace-day-2",
      userId: "user-daily-metrics",
      projectId: "project-daily-metrics",
    });

    // Simulate observations with usage metrics on different days
    await makeAPICall("POST", "/api/public/generations", {
      traceId: traceId1,
      model: "modelA",
      usage: { input: 100, output: 200, total: 300 },
      startTime: "2021-01-01T00:00:00.000Z",
      endTime: "2021-01-01T00:01:00.000Z",
    });
    await makeAPICall("POST", "/api/public/generations", {
      traceId: traceId2,
      model: "modelB",
      usage: { input: 333 },
      startTime: "2021-01-02T00:00:00.000Z",
      endTime: "2021-01-02T00:02:00.000Z",
    });
    await makeAPICall("POST", "/api/public/generations", {
      traceId: traceId2,
      model: "modelC",
      usage: { input: 666, output: 777, totalCost: 1024.22 },
      startTime: "2021-01-02T00:00:00.000Z",
      endTime: "2021-01-02T00:04:00.000Z",
    });

    // Retrieve the daily metrics
    const dailyMetricsResponse = await makeAPICall(
      "GET",
      `/api/public/metrics/daily`,
    );
    const dailyMetricsData = dailyMetricsResponse.body.data;

    // Check if the daily metrics are calculated correctly
    expect(dailyMetricsData).toHaveLength(2); // Two days of data
    expect(dailyMetricsData[0].date).toBe("2021-01-02"); // Latest date first
    expect(dailyMetricsData[0].count_traces).toBe(1);
    expect(dailyMetricsData[0].total_cost).toEqual(1024.22);
    expect(dailyMetricsData[0].usage).toEqual([
      {
        model: "modelB",
        usage_input: 333,
        usage_output: 0,
        usage_total: 333,
      },
      {
        model: "modelC",
        usage_input: 666,
        usage_output: 777,
        usage_total: 1443,
      },
    ]);
    expect(dailyMetricsData[1].date).toBe("2021-01-01");
    expect(dailyMetricsData[1].count_traces).toBe(1);
    expect(dailyMetricsData[1].total_cost).toEqual(0);
    expect(dailyMetricsData[1].usage).toEqual([
      {
        model: "modelA",
        usage_input: 100,
        usage_output: 200,
        usage_total: 300,
      },
    ]);
  });
});
