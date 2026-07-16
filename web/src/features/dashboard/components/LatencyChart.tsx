import { type FilterState, getGenerationLikeTypes } from "@langfuse/shared";
import {
  extractTimeSeriesData,
  fillMissingValuesAndTransform,
  isEmptyTimeSeries,
} from "@/src/features/dashboard/components/hooks";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { TabComponent } from "@/src/features/dashboard/components/TabsComponent";
import {
  type DashboardDateRangeAggregationOption,
  dashboardDateRangeAggregationSettings,
} from "@/src/utils/date-range-utils";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import {
  ModelSelectorPopover,
  useModelSelection,
} from "@/src/features/dashboard/components/ModelSelector";
import { type QueryType, type ViewVersion } from "@langfuse/shared/query";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import type { DatabaseRow } from "@/src/server/api/services/sqlInterface";
import { DashboardLineTimeSeriesChart } from "@/src/features/dashboard/components/DashboardLineTimeSeriesChart";
import { useScheduledDashboardExecuteQuery } from "@/src/hooks/useDashboardQueryScheduler";
import { useMemo } from "react";

export const GenerationLatencyChart = ({
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
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  agg: DashboardDateRangeAggregationOption;
  fromTimestamp: Date;
  toTimestamp: Date;
  isLoading?: boolean;
  metricsVersion?: ViewVersion;
  schedulerId?: string;
  syncId?: string;
}) => {
  const {
    allModels,
    selectedModels,
    setSelectedModels,
    isAllSelected,
    buttonText,
    handleSelectAll,
  } = useModelSelection(
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
    ];
  }, [latencies.data, selectedModels]);

  return (
    <DashboardCard
      className={className}
      title="Model latencies"
      description="Latencies (seconds) per LLM generation"
      isLoading={
        isLoading || (latencies.isPending && selectedModels.length > 0)
      }
      headerRight={
        <div className="flex items-center justify-end">
          <ModelSelectorPopover
            allModels={allModels}
            selectedModels={selectedModels}
            setSelectedModels={setSelectedModels}
            buttonText={buttonText}
            isAllSelected={isAllSelected}
            handleSelectAll={handleSelectAll}
          />
        </div>
      }
    >
      <TabComponent
        tabs={data.map((item) => {
          return {
            tabTitle: item.tabTitle,
            content: (
              <>
                {!isEmptyTimeSeries({ data: item.data }) ? (
                  // The height is the flex basis (floor); grow lets the chart absorb
                  // extra tile height. On grid (lg) screens the floor is smaller so
                  // tiles fit narrow viewports — grow recovers the height above the
                  // grid's rowHeight floor. (LFE-10813)
                  <div className="h-80 w-full shrink-0 grow lg:h-56">
                    <DashboardLineTimeSeriesChart
                      data={item.data}
                      label="Latency"
                      unit="millisecond"
                      syncId={syncId}
                      missingValue="gap"
                    />
                  </div>
                ) : (
                  <NoDataOrLoading
                    isLoading={isLoading || latencies.isPending}
                    className="h-auto grow"
                  />
                )}
              </>
            ),
          };
        })}
      />
    </DashboardCard>
  );
};
