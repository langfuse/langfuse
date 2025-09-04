import { api } from "@/src/utils/api";
import { type FilterState, getGenerationLikeTypes } from "@langfuse/shared";
import {
  extractTimeSeriesData,
  fillMissingValuesAndTransform,
  isEmptyTimeSeries,
} from "@/src/features/dashboard/components/hooks";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import { TabComponent } from "@/src/features/dashboard/components/TabsComponent";
import { latencyFormatter } from "@/src/utils/numbers";
import {
  type DashboardDateRangeAggregationOption,
  dashboardDateRangeAggregationSettings,
} from "@/src/utils/date-range-utils";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import {
  ModelSelectorPopover,
  useModelSelection,
} from "@/src/features/dashboard/components/ModelSelector";
import {
  type QueryType,
  mapLegacyUiTableFilterToView,
} from "@/src/features/query";
import type { DatabaseRow } from "@/src/server/api/services/sqlInterface";
import { useTranslation } from "next-i18next";

export const GenerationLatencyChart = ({
  className,
  projectId,
  globalFilterState,
  agg,
  fromTimestamp,
  toTimestamp,
  isLoading = false,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  agg: DashboardDateRangeAggregationOption;
  fromTimestamp: Date;
  toTimestamp: Date;
  isLoading?: boolean;
}) => {
  const { t } = useTranslation("common");
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
  );

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
      granularity: dashboardDateRangeAggregationSettings[agg].date_trunc,
    },
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  const latencies = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: latenciesQuery,
    },
    {
      enabled: !isLoading && selectedModels.length > 0 && allModels.length > 0,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const getData = (valueColumn: string) => {
    return latencies.data && selectedModels.length > 0
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
        )
      : [];
  };

  const data = [
    {
      tabTitle: t("dashboard.percentile50"),
      data: getData("p50_latency"),
    },
    {
      tabTitle: t("dashboard.percentile75"),
      data: getData("p75_latency"),
    },
    {
      tabTitle: t("dashboard.percentile90"),
      data: getData("p90_latency"),
    },
    {
      tabTitle: t("dashboard.percentile95"),
      data: getData("p95_latency"),
    },
    {
      tabTitle: t("dashboard.percentile99"),
      data: getData("p99_latency"),
    },
  ];

  return (
    <DashboardCard
      className={className}
      title={t("dashboard.modelLatencies")}
      description={t("dashboard.latenciesDescription")}
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
                  <BaseTimeSeriesChart
                    agg={agg}
                    data={item.data}
                    connectNulls={true}
                    valueFormatter={latencyFormatter}
                  />
                ) : (
                  <NoDataOrLoading
                    isLoading={isLoading || latencies.isPending}
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
