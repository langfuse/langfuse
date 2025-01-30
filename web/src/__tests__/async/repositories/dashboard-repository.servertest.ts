import { orderByTimeSeries } from "@langfuse/shared/src/server";

describe("orderByTimeSeries", () => {
  test("should return correct bucket size and query for 1 hour time range", () => {
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

  test("should return correct bucket size and query for 1 day time range", () => {
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

  test("should handle empty filter by using default time range", () => {
    expect(() => orderByTimeSeries([], "timestamp")).toThrow(
      "Time Filter is required for time series queries",
    );
  });
});
