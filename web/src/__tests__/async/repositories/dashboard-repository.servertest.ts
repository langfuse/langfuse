import { prepareUsageDataForTimeseriesChart } from "@/src/features/dashboard/components/ModelUsageChart";
import { orderByTimeSeries } from "@langfuse/shared/src/server";

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
});
