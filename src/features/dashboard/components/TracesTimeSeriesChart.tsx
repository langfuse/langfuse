import { api } from "@/src/utils/api";
import {
  dateTimeAggregationSettings,
  type DateTimeAggregationOption,
} from "@/src/features/dashboard/lib/timeseries-aggregation";
import { type FilterState } from "@/src/features/filters/types";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { compactNumberFormatter } from "@/src/utils/numbers";
import DocPopup from "@/src/components/layouts/doc-popup";

export const TracesTimeSeriesChart = ({
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
  const traces = api.dashboard.chart.useQuery({
    projectId,
    from: "traces",
    select: [{ column: "traceId", agg: "COUNT" }],
    filter:
      globalFilterState.map((f) =>
        f.type === "datetime" ? { ...f, column: "timestamp" } : f,
      ) ?? [],
    groupBy: [
      {
        type: "datetime",
        column: "timestamp",
        temporalUnit: dateTimeAggregationSettings[agg].date_trunc,
      },
    ],
  });

  const transformedTraces = traces.data
    ? traces.data.map((item) => {
        return {
          ts: (item.timestamp as Date).getTime(),
          values: [
            {
              label: "Traces",
              value:
                typeof item.countTraceId === "number"
                  ? item.countTraceId
                  : undefined,
            },
          ],
        };
      })
    : [];

  const total = traces.data?.reduce((acc, item) => {
    return acc + (item.countTraceId as number);
  }, 0);

  return (
    <DashboardCard
      className={className}
      title="Traces"
      isLoading={traces.isLoading}
      cardContentClassName="flex flex-col content-end "
    >
      <TotalMetric
        description={`Traces tracked`}
        metric={total ? compactNumberFormatter(total) : "-"}
      >
        <DocPopup
          link={"https://langfuse.com/docs/integrations/sdk"}
          description={
            "Tracing of LLM applications can be enabled using the SDK"
          }
        />
      </TotalMetric>
      <BaseTimeSeriesChart
        className="min-h-80 lg:h-full"
        agg={agg}
        data={transformedTraces ?? []}
        connectNulls={true}
      />
    </DashboardCard>
  );
};
