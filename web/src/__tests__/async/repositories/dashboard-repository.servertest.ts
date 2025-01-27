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
      "ORDER BY timestamp ASC \n    WITH FILL\n    STEP toIntervalSecond(60)",
    );
    expect(params.fromTime).toEqual(new Date("2024-01-01T00:00:00Z"));
    expect(params.toTime).toEqual(new Date("2024-01-01T01:00:00Z"));
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
      "ORDER BY timestamp ASC \n    WITH FILL\n    STEP toIntervalSecond(1800)",
    );
    expect(params.fromTime).toEqual(new Date("2024-01-01T00:00:00Z"));
    expect(params.toTime).toEqual(new Date("2024-01-02T00:00:00Z"));
  });

  test("should handle empty filter by using default time range", () => {
    const [query, params, bucketSize] = orderByTimeSeries([], "timestamp");

    // Should use default 1 year range and pick appropriate bucket size
    expect(bucketSize).toBe(604800); // 1 week buckets
    expect(query).toBe(
      "ORDER BY timestamp ASC \n    WITH FILL\n    STEP toIntervalSecond(604800)",
    );
    expect(params.fromTime).toBeDefined();
    expect(params.toTime).toBeDefined();
    expect(params.toTime.getTime() - params.fromTime.getTime()).toBeCloseTo(
      365 * 24 * 60 * 60 * 1000,
      -3,
    );
  });
});
