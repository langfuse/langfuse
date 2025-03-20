import {
  extractTimeSeriesData,
  fillMissingValuesAndTransform,
} from "@/src/features/dashboard/components/hooks";
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
    it.only("should aggregate time series for model cost and usage", async () => {
      const metricHistory = prepareUsageDataForTimeseriesChart(
        ["claude-3-5-sonnet-20241022", "gpt-4o", "gpt-4o-mini"],
        [
          {
            startTime: "2025-03-19T17:00:00.000Z",
            units: {
              input: 1099851,
              input_audio: 0,
              input_cache_read: 99584,
              output: 155855,
              output_audio: 0,
              output_reasoning: 0,
              total: 1355290,
            },
            cost: {
              input: 2.7496275,
              input_cache_read: 0.12448,
              output: 1.55855,
              total: 4.432657499912,
            },
            model: "gpt-4o",
          },
          {
            startTime: "2025-03-19T17:00:00.000Z",
            units: {
              input: 490056,
              input_audio: 0,
              input_cache_read: 0,
              output: 89104,
              output_audio: 0,
              output_reasoning: 0,
              total: 579160,
            },
            cost: {
              input: 0.0735084,
              input_cache_read: 0,
              output: 0.0534624,
              total: 0.126970799902,
            },
            model: "gpt-4o-mini",
          },
          {
            startTime: "2025-03-19T17:00:00.000Z",
            units: {
              input: 1356464,
              input_cache_creation: 0,
              input_cache_read: 0,
              output: 319454,
              total: 1675918,
            },
            cost: {
              input: 4.069392,
              input_cache_creation: 0,
              input_cache_read: 0,
              output: 4.79181,
              total: 8.861201999873,
            },
            model: "claude-3-5-sonnet-20241022",
          },
        ],
      );

      console.log(metricHistory);

      const usageData = Array.from(metricHistory.get("total")?.values() ?? []);

      const unitsByModel = fillMissingValuesAndTransform(
        extractTimeSeriesData(usageData, "startTime", [
          {
            uniqueIdentifierColumns: [
              { accessor: "model" },
              { accessor: "total" },
            ],
            valueColumn: "cost",
          },
        ]),
        ["claude-3-5-sonnet-20241022", "gpt-4o", "gpt-4o-mini"],
      );

      console.log(JSON.stringify(unitsByModel, null, 2));

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
