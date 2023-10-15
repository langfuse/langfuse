import { api } from "@/src/utils/api";
import {
  dateTimeAggregationSettings,
  type DateTimeAggregationOption,
} from "@/src/features/dashboard/lib/timeseries-aggregation";
import { type FilterState } from "@/src/features/filters/types";
import {
  getAllModels,
  extractTimeSeriesData,
  fillMissingValuesAndTransform,
} from "@/src/features/dashboard/components/hooks";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import { compactNumberFormatter, numberFormatter } from "@/src/utils/numbers";
import { TabComponent } from "@/src/features/dashboard/components/TabsComponent";

export const LatencyChart = ({
  className,
  projectId,
  globalFilterState,
  agg,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  agg: DateTimeAggregationOption;
}) => {
  const latencies = api.dashboard.chart.useQuery({
    projectId,
    from: "observations",
    select: [
      { column: "duration", agg: "50thPercentile" },
      { column: "duration", agg: "90thPercentile" },
      { column: "duration", agg: "95thPercentile" },
      { column: "duration", agg: "99thPercentile" },
      { column: "model" },
    ],
    filter:
      [
        ...globalFilterState,
        { type: "string", column: "type", operator: "=", value: "GENERATION" },
      ] ?? [],
    groupBy: [
      {
        type: "datetime",
        column: "startTime",
        temporalUnit: dateTimeAggregationSettings[agg].date_trunc,
      },
      { type: "string", column: "model" },
    ],
  });

  const allModels = getAllModels(projectId, globalFilterState);

  const getData = (valueColumn: string) => {
    return latencies.data && allModels
      ? fillMissingValuesAndTransform(
          extractTimeSeriesData(latencies.data, "startTime", [
            { labelColumn: "model", valueColumn: valueColumn },
          ]),
          allModels,
        )
      : [];
  };

  const data = [
    {
      tabTitle: "50th Percentile",
      data: getData("50thpercentileDuration"),
    },
    {
      tabTitle: "90th Percentile",
      data: getData("90thpercentileDuration"),
    },
    {
      tabTitle: "95th Percentile",
      data: getData("95thpercentileDuration"),
    },
    {
      tabTitle: "99th Percentile",
      data: getData("99thpercentileDuration"),
    },
  ];

  return (
    <DashboardCard
      className={className}
      title="Model latencies"
      description="Latencies (seconds) per LLM generation"
      isLoading={latencies.isLoading}
    >
      <TabComponent
        tabs={data.map((item) => {
          return {
            tabTitle: item.tabTitle,
            content: (
              <BaseTimeSeriesChart
                agg={agg}
                data={item.data}
                connectNulls={true}
                valueFormatter={numberFormatter}
              />
            ),
          };
        })}
      />
    </DashboardCard>
  );
};
