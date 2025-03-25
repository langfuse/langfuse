import {
  orderByTimeSeries,
  getObservationUsageByTypeByTime,
  createOrgProjectAndApiKey,
  createTrace,
  createTracesCh,
  createObservationsCh,
  createObservation,
} from "@langfuse/shared/src/server";

describe("orderByTimeSeries", () => {
  it("should return correct bucket size and query for 1 hour time range", () => {
    const filter = [
      {
        type: "datetime" as const,
        column: "timestamp",
        operator: ">=" as const,
        value: new Date("2024-01-01T00:00:00Z"),
      },
      {
        type: "datetime" as const,
        column: "timestamp",
        operator: "<=" as const,
        value: new Date("2024-01-01T01:00:00Z"),
      },
    ];

    const [query, params, bucketSize] = orderByTimeSeries(filter, "timestamp");

    // For 1 hour difference, should pick 60 second buckets to get ~60 data points
    expect(bucketSize).toBe(60);
    expect(query).toBe(
      "ORDER BY timestamp ASC \n    WITH FILL\n    FROM toStartOfInterval(toDateTime({fromTime: DateTime64(3)}), INTERVAL 60 SECOND)\n    TO toDateTime({toTime: DateTime64(3)}) + INTERVAL 60 SECOND\n    STEP toIntervalSecond(60)",
    );
    expect(params.fromTime).toBe(new Date("2024-01-01T00:00:00Z").getTime());
    expect(params.toTime).toBe(new Date("2024-01-01T01:00:00Z").getTime());
  });

  it("should return correct bucket size and query for 1 minute time range", () => {
    const filter = [
      {
        type: "datetime" as const,
        column: "timestamp",
        operator: ">=" as const,
        value: new Date("2024-01-01T00:00:00Z"),
      },
      {
        type: "datetime" as const,
        column: "timestamp",
        operator: "<=" as const,
        value: new Date("2024-01-01T00:01:00Z"),
      },
    ];

    const [query, params, bucketSize] = orderByTimeSeries(filter, "timestamp");

    // For 1 minute difference, should pick 5 second buckets to get ~12 data points
    expect(bucketSize).toBe(5); // 5 seconds
    expect(query).toBe(
      "ORDER BY timestamp ASC \n    WITH FILL\n    FROM toStartOfInterval(toDateTime({fromTime: DateTime64(3)}), INTERVAL 5 SECOND)\n    TO toDateTime({toTime: DateTime64(3)}) + INTERVAL 5 SECOND\n    STEP toIntervalSecond(5)",
    );
    expect(params.fromTime).toBe(new Date("2024-01-01T00:00:00Z").getTime());
    expect(params.toTime).toBe(new Date("2024-01-01T00:01:00Z").getTime());
  });

  it("should return correct bucket size and query for 1 day time range", () => {
    const filter = [
      {
        type: "datetime" as const,
        column: "timestamp",
        operator: ">=" as const,
        value: new Date("2024-01-01T00:00:00Z"),
      },
      {
        type: "datetime" as const,
        column: "timestamp",
        operator: "<=" as const,
        value: new Date("2024-01-02T00:00:00Z"),
      },
    ];

    const [query, params, bucketSize] = orderByTimeSeries(filter, "timestamp");

    // For 24 hour difference, should pick 1800 second (30 min) buckets
    expect(bucketSize).toBe(1800);
    expect(query).toBe(
      "ORDER BY timestamp ASC \n    WITH FILL\n    FROM toStartOfInterval(toDateTime({fromTime: DateTime64(3)}), INTERVAL 1800 SECOND)\n    TO toDateTime({toTime: DateTime64(3)}) + INTERVAL 1800 SECOND\n    STEP toIntervalSecond(1800)",
    );
    expect(params.fromTime).toBe(new Date("2024-01-01T00:00:00Z").getTime());
    expect(params.toTime).toBe(new Date("2024-01-02T00:00:00Z").getTime());
  });

  it("should handle empty filter by using default time range", () => {
    expect(() => orderByTimeSeries([], "timestamp")).toThrow(
      "Time Filter is required for time series queries",
    );
  });

  describe("getObservationUsageByTypeByTime", () => {
    const mockFilter = [
      {
        type: "datetime" as const,
        column: "timestamp",
        operator: ">=" as const,
        value: new Date("2024-01-01T00:00:00Z"),
      },
      {
        type: "datetime" as const,
        column: "timestamp",
        operator: "<=" as const,
        value: new Date("2024-01-02T01:00:00Z"),
      },
    ];

    it("should return usage data grouped by time and type", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const trace = createTrace({
        name: "trace-name",
        project_id: projectId,
        timestamp: new Date("2024-01-01T01:00:00Z").getTime(),
      });

      const trace2 = createTrace({
        name: "trace-name",
        project_id: projectId,
        timestamp: new Date("2024-01-01T04:00:00Z").getTime(),
      });

      await createTracesCh([trace, trace2]);

      const obs1 = createObservation({
        trace_id: trace.id,
        project_id: trace.project_id,
        usage_details: { input: 1, output: 2, total: 3 },
        start_time: new Date("2024-01-01T01:00:00Z").getTime(),
      });

      const obs2 = createObservation({
        trace_id: trace.id,
        project_id: trace.project_id,
        usage_details: { input: 4, output: 5, total: 9 },
        start_time: new Date("2024-01-01T01:00:00Z").getTime(),
      });

      const obs3 = createObservation({
        trace_id: trace2.id,
        project_id: trace.project_id,
        usage_details: { input: 400, output: 500, total: 900 },
        start_time: new Date("2024-01-01T04:00:00Z").getTime(),
      });

      await createObservationsCh([obs1, obs2, obs3]);

      const result = await getObservationUsageByTypeByTime(
        projectId,
        mockFilter,
      );

      // Verify the structure of the returned data
      expect(result).toEqual(
        expect.arrayContaining([
          {
            intervalStart: new Date("2024-01-01T01:00:00Z"),
            key: "input",
            sum: 5,
          },
          {
            intervalStart: new Date("2024-01-01T01:00:00Z"),
            key: "output",
            sum: 7,
          },
          {
            intervalStart: new Date("2024-01-01T01:00:00Z"),
            key: "total",
            sum: 12,
          },
          {
            intervalStart: new Date("2024-01-01T04:00:00Z"),
            key: "input",
            sum: 400,
          },
          {
            intervalStart: new Date("2024-01-01T04:00:00Z"),
            key: "output",
            sum: 500,
          },
          {
            intervalStart: new Date("2024-01-01T04:00:00Z"),
            key: "total",
            sum: 900,
          },
        ]),
      );
    });
  });
});
