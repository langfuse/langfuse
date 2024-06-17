import { api } from "@/src/utils/api";
import {
  dateTimeAggregationSettings,
  type DateTimeAggregationOption,
} from "@/src/features/dashboard/lib/timeseries-aggregation";
import { type FilterState } from "@langfuse/shared";
import {
  getAllModels,
  extractTimeSeriesData,
  fillMissingValuesAndTransform,
  isEmptyTimeSeries,
} from "@/src/features/dashboard/components/hooks";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import { TabComponent } from "@/src/features/dashboard/components/TabsComponent";
import { latencyFormatter } from "@/src/utils/numbers";
import { NoData } from "@/src/features/dashboard/components/NoData";

export const GenerationLatencyChart = ({
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
  const latencies = api.dashboard.chart.useQuery(
    {
      projectId,
      from: "traces_observations",
      select: [
        { column: "duration", agg: "50thPercentile" },
        { column: "duration", agg: "75thPercentile" },
        { column: "duration", agg: "90thPercentile" },
        { column: "duration", agg: "95thPercentile" },
        { column: "duration", agg: "99thPercentile" },
        { column: "model" },
      ],
      filter: [
        ...globalFilterState,
        {
          type: "string",
          column: "type",
          operator: "=",
          value: "GENERATION",
        },
      ],
      groupBy: [
        {
          type: "datetime",
          column: "startTime",
          temporalUnit: dateTimeAggregationSettings[agg].date_trunc,
        },
        { type: "string", column: "model" },
      ],
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const allModels = getAllModels(projectId, globalFilterState);

  const getData = (valueColumn: string) => {
    return latencies.data && allModels.length > 0
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
      data: getData("percentile50Duration"),
    },
    {
      tabTitle: "75th Percentile",
      data: getData("percentile75Duration"),
    },
    {
      tabTitle: "90th Percentile",
      data: getData("percentile90Duration"),
    },
    {
      tabTitle: "95th Percentile",
      data: getData("percentile95Duration"),
    },
    {
      tabTitle: "99th Percentile",
      data: getData("percentile99Duration"),
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
              <>
                {!isEmptyTimeSeries(item.data) ? (
                  <BaseTimeSeriesChart
                    agg={agg}
                    data={item.data}
                    connectNulls={true}
                    valueFormatter={latencyFormatter}
                  />
                ) : (
                  <NoData noDataText="No data" />
                )}
              </>
            ),
          };
        })}
      />
    </DashboardCard>
  );
};
