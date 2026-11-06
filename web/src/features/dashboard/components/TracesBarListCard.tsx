/* eslint-disable @repo/no-style-props */
import { type FilterState } from "@langfuse/shared";
import { type DataCardActions } from "@/src/components/design-system/DataCard/DataCard";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { type QueryType, type ViewVersion } from "@langfuse/shared/query";
import { formatMetric } from "@/src/features/widgets/chart-library/utils";
import { WidgetChartCard } from "@/src/features/widgets/components/WidgetChartCard";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { traceViewQuery } from "@/src/features/dashboard/lib/dashboard-utils";
import { useScheduledDashboardExecuteQuery } from "@/src/features/dashboard/hooks/DashboardQuerySchedulerProvider";
import { cn } from "@/src/utils/tailwind";

// Cap on bars fetched and rendered; the top list scrolls within the tile when
// they don't all fit.
const MAX_BARS = 20;

export const TracesBarListCard = ({
  actions,
  className,
  projectId,
  globalFilterState,
  fromTimestamp,
  toTimestamp,
  isLoading = false,
  metricsVersion,
  schedulerId,
}: {
  actions?: DataCardActions;
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  isLoading?: boolean;
  metricsVersion: ViewVersion;
  schedulerId?: string;
}) => {
  const isV2 = metricsVersion === "v2";
  const traceNameField = isV2 ? "traceName" : "name";
  const countField = isV2 ? "uniq_traceId" : "count_count";

  // Total traces query using executeQuery
  const totalTracesQuery: QueryType = {
    ...traceViewQuery({ metricsVersion, globalFilterState }),
    dimensions: [],
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  const totalTraces = useScheduledDashboardExecuteQuery(
    {
      projectId,
      query: totalTracesQuery,
      version: metricsVersion,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      queryId: `${schedulerId ?? "home:traces"}:total`,
      enabled: !isLoading,
    },
  );

  // Traces grouped by name query using executeQuery
  const tracesQuery: QueryType = {
    ...traceViewQuery({
      metricsVersion,
      globalFilterState,
      groupedByName: true,
    }),
    dimensions: [{ field: traceNameField }],
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: [{ field: countField, direction: "desc" }],
    chartConfig: { type: "table", row_limit: MAX_BARS },
  };

  const traces = useScheduledDashboardExecuteQuery(
    {
      projectId,
      query: tracesQuery,
      version: metricsVersion,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      queryId: `${schedulerId ?? "home:traces"}:grouped`,
      enabled: !isLoading,
    },
  );

  const transformedTraces: DataPoint[] =
    traces.data?.map((item) => {
      return {
        dimension: item[traceNameField]
          ? (item[traceNameField] as string)
          : "Unknown",
        metric: Number(item[countField]),
        time_dimension: undefined,
      };
    }) ?? [];

  return (
    <div className={cn(className, "h-full")}>
      <WidgetChartCard
        chartType="HORIZONTAL_BAR"
        actions={actions}
        title="Traces"
        description={null}
        content={(() => {
          if (isLoading || traces.isPending || totalTraces.isPending)
            return { type: "loading", progress: { type: "spinner" } };
          if (!transformedTraces.length)
            return {
              type: "empty",
              description:
                "Traces contain details about LLM applications and can be created using the SDK.",
              href: "https://langfuse.com/docs/get-started",
            };
          return undefined;
        })()}
        metric={{
          value: compactNumberFormatter(
            totalTraces.data?.[0]?.[countField]
              ? Number(totalTraces.data[0][countField])
              : 0,
          ),
          description: "Total traces tracked",
        }}
        data={transformedTraces}
        rowLimit={MAX_BARS}
        label="Traces"
        unit="traces"
        metricFormatter={(value) => formatMetric(value, { style: "full" })}
      />
    </div>
  );
};
