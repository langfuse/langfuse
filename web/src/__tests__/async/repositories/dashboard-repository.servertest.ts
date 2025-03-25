import { prepareUsageDataForTimeseriesChart } from "@/src/features/dashboard/components/ModelUsageChart";
import {
  orderByTimeSeries,
  getObservationUsageByTypeByTime,
  getObservationCostByTypeByTime,
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

  describe("aggregate time series for model cost and usage", () => {
    it("should aggregate time series for model cost and usage", async () => {
      const metricHistory = prepareUsageDataForTimeseriesChart(
        ["gpt-4o-mini", "text-embedding-ada-002"],
        [
          {
            startTime: "2025-02-10T13:30:00.000Z",
            units: {
              input: 422,
              output: 61,
              total: 483,
            },
            cost: {
              input: 0.0000633,
              output: 0.0000366,
              total: 0.0000999,
            },
            model: "gpt-4o-mini",
          },
          {
            startTime: "2025-02-10T13:30:00.000Z",
            units: {
              input: 6,
              total: 6,
            },
            cost: {
              total: 6e-7,
            },
            model: "text-embedding-ada-002",
          },
        ],
      );

      expect(metricHistory.get("total")).toEqual([
        {
          startTime: "2025-02-10T13:30:00.000Z",
          units: 483,
          cost: 0.0000999,
          model: "gpt-4o-mini",
          usageType: "total",
        },
        {
          startTime: "2025-02-10T13:30:00.000Z",
          units: 6,
          cost: 6e-7,
          model: "text-embedding-ada-002",
          usageType: "total",
        },
      ]);
    });
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

    it.only("should return usage data grouped by time and type", async () => {
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

  describe("getObservationCostByTypeByTime", () => {
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
        value: new Date("2024-01-01T01:00:00Z"),
      },
    ];

    it("should return cost data grouped by time and type", async () => {
      const result = await getObservationCostByTypeByTime(
        "test-project",
        mockFilter,
      );

      // Verify the structure of the returned data
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            intervalStart: expect.any(Date),
            key: expect.any(String),
            sum: expect.any(Number),
          }),
        ]),
      );
    });

    it("should handle empty results", async () => {
      // Use a time range where we know there's no data
      const emptyFilter = [
        {
          type: "datetime" as const,
          column: "timestamp",
          operator: ">=" as const,
          value: new Date("2020-01-01T00:00:00Z"),
        },
        {
          type: "datetime" as const,
          column: "timestamp",
          operator: "<=" as const,
          value: new Date("2020-01-01T01:00:00Z"),
        },
      ];

      const result = await getObservationCostByTypeByTime(
        "test-project",
        emptyFilter,
      );
      expect(result).toEqual([]);
    });

    it("should handle null cost values", async () => {
      const result = await getObservationCostByTypeByTime(
        "test-project",
        mockFilter,
      );

      // Check if null values are properly handled
      result.forEach((item: { sum: number | null }) => {
        expect(item.sum).not.toBeUndefined();
        if (item.sum === null) {
          expect(item.sum).toBeNull();
        } else {
          expect(typeof item.sum).toBe("number");
        }
      });
    });

    it("should maintain consistent time buckets", async () => {
      const result = await getObservationCostByTypeByTime(
        "test-project",
        mockFilter,
      );

      // Get unique timestamps
      const timestamps = [
        ...new Set(
          result.map((item: { intervalStart: Date }) =>
            item.intervalStart.getTime(),
          ),
        ),
      ];

      // Check if timestamps are evenly spaced
      for (let i = 1; i < timestamps.length; i++) {
        const diff = timestamps[i] - timestamps[i - 1];
        // Assuming 60-second buckets based on the 1-hour time range
        expect(diff).toBe(60 * 1000); // 60 seconds in milliseconds
      }
    });
  });
});
