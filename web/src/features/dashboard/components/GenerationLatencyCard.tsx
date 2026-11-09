/* eslint-disable @repo/no-style-props */
import { type FilterState, getGenerationLikeTypes } from "@langfuse/shared";
import {
  extractTimeSeriesData,
  fillMissingValuesAndTransform,
} from "@/src/features/dashboard/components/hooks";
import { type DataCardActions } from "@/src/components/design-system/DataCard/DataCard";
import { useDashboardCardTabs } from "@/src/features/dashboard/hooks/useDashboardCardTabs";
import {
  type DashboardDateRangeAggregationOption,
  dashboardDateRangeAggregationSettings,
} from "@/src/utils/date-range-utils";
import { useModelSelection } from "@/src/features/dashboard/hooks/useModelSelection";
import { type QueryType, type ViewVersion } from "@langfuse/shared/query";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import type { DatabaseRow } from "@/src/server/api/services/sqlInterface";
import { WidgetChartCard } from "@/src/features/widgets/components/WidgetChartCard";
import { timeSeriesToDataPoints } from "@/src/features/dashboard/lib/chart-data-adapters";
import { useScheduledDashboardExecuteQuery } from "@/src/features/dashboard/hooks/DashboardQuerySchedulerProvider";
import { useMemo } from "react";

export const GenerationLatencyCard = ({
  actions,
  className,
  projectId,
  globalFilterState,
  agg,
  fromTimestamp,
  toTimestamp,
  isLoading = false,
  metricsVersion,
  schedulerId,
  syncId,
  sync,
}: {
  actions?: DataCardActions;
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  agg: DashboardDateRangeAggregationOption;
  fromTimestamp: Date;
  toTimestamp: Date;
  isLoading?: boolean;
  metricsVersion: ViewVersion;
  schedulerId?: string;
  syncId?: string;
  sync?: {
    activeKey: string | undefined;
    onActiveKeyChange: (key: string | undefined) => void;
  };
}) => {
  const { allModels, selectedModels, setSelectedModels } = useModelSelection(
    projectId,
    globalFilterState,
    fromTimestamp,
    toTimestamp,
    metricsVersion,
    {
      enabled: !isLoading,
      queryId: `${schedulerId ?? "home:generation-latency"}:all-models`,
    },
  );
  const hasModelSelection = selectedModels.length > 0 && allModels.length > 0;
  const isLatencyEnabled = !isLoading && hasModelSelection;

  const latenciesQuery: QueryType = {
    view: "observations",
    dimensions: [{ field: "providedModelName" }],
    metrics: [
      { measure: "latency", aggregation: "p50" },
      { measure: "latency", aggregation: "p75" },
      { measure: "latency", aggregation: "p90" },
      { measure: "latency", aggregation: "p95" },
      { measure: "latency", aggregation: "p99" },
    ],
    filters: [
      ...mapLegacyUiTableFilterToView("observations", globalFilterState),
      {
        column: "type",
        operator: "any of",
        value: getGenerationLikeTypes(),
        type: "stringOptions",
      },
      {
        column: "providedModelName",
        operator: "any of",
        value: selectedModels,
        type: "stringOptions",
      },
    ],
    timeDimension: {
      granularity:
        dashboardDateRangeAggregationSettings[agg].dateTrunc ?? "day",
    },
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  const latencies = useScheduledDashboardExecuteQuery(
    {
      projectId,
      query: latenciesQuery,
      version: metricsVersion,
    },
    {
      enabled: isLatencyEnabled,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      queryId: `${schedulerId ?? "home:generation-latency"}:latencies`,
      priority: 1001,
    },
  );

  // Memoized on the raw query result + model selection so each series ref is
  // stable across the scheduler's page re-renders (lets the chart memo bail).
  const data = useMemo(() => {
    const getData = (valueColumn: string) =>
      latencies.data && selectedModels.length > 0
        ? fillMissingValuesAndTransform(
            extractTimeSeriesData(
              latencies.data as DatabaseRow[],
              "time_dimension",
              [
                {
                  uniqueIdentifierColumns: [{ accessor: "providedModelName" }],
                  valueColumn: valueColumn,
                },
              ],
            ),
            selectedModels,
            // A latency percentile has no honest value on a bucket without
            // generations — gap the line, don't fabricate a 0. (LFE-10694)
            "gap",
          )
        : [];
    return [
      { tabTitle: "50th Percentile", data: getData("p50_latency") },
      { tabTitle: "75th Percentile", data: getData("p75_latency") },
      { tabTitle: "90th Percentile", data: getData("p90_latency") },
      { tabTitle: "95th Percentile", data: getData("p95_latency") },
      { tabTitle: "99th Percentile", data: getData("p99_latency") },
    ] as const;
  }, [latencies.data, selectedModels]);

  const { selectedItem: item, tabs } = useDashboardCardTabs(data);
  const chartData = useMemo(
    () => timeSeriesToDataPoints(item?.data ?? []),
    [item?.data],
  );

  return (
    <div className={className}>
      <WidgetChartCard
        chartType="LINE_TIME_SERIES"
        actions={actions}
        title="Model latencies"
        description="Latencies (seconds) per LLM generation"
        tabs={tabs}
        content={
          isLoading || (latencies.isPending && selectedModels.length > 0)
            ? { type: "loading", progress: { type: "spinner" } }
            : undefined
        }
        controls={[
          {
            type: "multiselect",
            id: "models",
            label: "Models",
            value: selectedModels,
            options: allModels.map(({ model }) => ({
              value: model,
              label: model || "none",
            })),
            onValueChange: setSelectedModels,
            placeholder: "Select models",
            searchPlaceholder: "Search models...",
            emptyMessage: "No model found.",
            selectAllLabel: "Select All",
          },
        ]}
        data={chartData}
        label="Latency"
        unit="millisecond"
        syncId={syncId}
        sync={sync}
        missingValue="gap"
      />
    </div>
  );
};
