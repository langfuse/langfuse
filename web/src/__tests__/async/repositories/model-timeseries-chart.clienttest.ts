import {
  fillMissingValuesAndTransform,
  extractTimeSeriesData,
} from "@/src/features/dashboard/components/hooks";
import { createUsageTypeMap } from "@/src/features/dashboard/components/ModelUsageChart";

describe("display model timeseries chart", () => {
  it.only("should display model timeseries chart", async () => {
    const { costMap } = createUsageTypeMap(
      ["claude-3-5-sonnet-20241022", "gpt-4o", "gpt-4o-mini"],
      [new Date("2025-03-19T17:00:00.000Z").getTime()],
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

    console.log(costMap);

    const allCostTimeSeries = Array.from(costMap.values()).flat();
    const costByType = allCostTimeSeries
      ? fillMissingValuesAndTransform(
          extractTimeSeriesData(allCostTimeSeries, "startTime", [
            {
              uniqueIdentifierColumns: [{ accessor: "usageType" }],
              valueColumn: "cost",
            },
          ]),
          Array.from(costMap.keys()),
        )
      : [];

    console.log(JSON.stringify(costByType, null, 2));

    // expect(metricHistory.get("total")).toEqual([
    //   {
    //     startTime: "2025-02-10T13:30:00.000Z",
    //     units: 483,
    //     cost: 0.0000999,
    //     model: "gpt-4o-mini",
    //     usageType: "total",
    //   },
    //   {
    //     startTime: "2025-02-10T13:30:00.000Z",
    //     units: 6,
    //     cost: 6e-7,
    //     model: "text-embedding-ada-002",
    //     usageType: "total",
    //   },
    // ]);
  });
});
