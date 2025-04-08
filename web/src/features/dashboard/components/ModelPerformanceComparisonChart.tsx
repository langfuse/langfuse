import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { TabComponent } from "@/src/features/dashboard/components/TabsComponent";
import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { api } from "@/src/utils/api";
import { type FilterState } from "@langfuse/shared";
import { type DashboardDateRangeAggregationOption } from "@/src/utils/date-range-utils";
import {
  ModelSelectorPopover,
  useModelSelection,
} from "@/src/features/dashboard/components/ModelSelector";
import {
  extractTimeSeriesData,
  fillMissingValuesAndTransform,
  isEmptyTimeSeries,
} from "@/src/features/dashboard/components/hooks";
import {
  type QueryType,
  mapLegacyUiTableFilterToView,
} from "@/src/features/query";
import { type DatabaseRow } from "@/src/server/api/services/sqlInterface";
import { Badge } from "@/src/components/ui/badge";
import DocPopup from "@/src/components/layouts/doc-popup";
import { totalCostDashboardFormatted } from "@/src/features/dashboard/lib/dashboard-utils";
import { Calculator, Clock } from "lucide-react";

type ModelPerformanceMetrics = {
  model: string;
  // Cost metrics
  totalCost: number;
  averageCost: number;
  // Latency metrics
  p50Latency: number;
  p95Latency: number;
};

export const ModelPerformanceComparisonChart = ({
  className,
  projectId,
  agg,
  fromTimestamp,
  toTimestamp,
  userAndEnvFilterState,
  isLoading = false,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  agg: DashboardDateRangeAggregationOption;
  fromTimestamp: Date;
  toTimestamp: Date;
  userAndEnvFilterState: FilterState;
  isLoading?: boolean;
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
    userAndEnvFilterState,
    fromTimestamp,
    toTimestamp,
  );

  // Fetch model costs
  const modelCostQuery: QueryType = {
    view: "observations",
    dimensions: [{ field: "providedModelName" }],
    metrics: [
      { measure: "totalCost", aggregation: "sum" },
      { measure: "totalCost", aggregation: "avg" },
      { measure: "totalTokens", aggregation: "sum" },
    ],
    filters: [
      ...mapLegacyUiTableFilterToView("observations", userAndEnvFilterState),
      {
        column: "type",
        operator: "=",
        value: "GENERATION",
        type: "string",
      },
      {
        column: "providedModelName",
        operator: "any of",
        value: selectedModels,
        type: "stringOptions",
      },
    ],
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  // Fetch model latencies
  const modelLatencyQuery: QueryType = {
    view: "observations",
    dimensions: [{ field: "providedModelName" }],
    metrics: [
      { measure: "latency", aggregation: "p50" },
      { measure: "latency", aggregation: "p95" },
    ],
    filters: [
      ...mapLegacyUiTableFilterToView("observations", userAndEnvFilterState),
      {
        column: "type",
        operator: "=",
        value: "GENERATION",
        type: "string",
      },
      {
        column: "providedModelName",
        operator: "any of",
        value: selectedModels,
        type: "stringOptions",
      },
    ],
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  // Cost over time query for chart
  const costOverTimeQuery: QueryType = {
    view: "observations",
    dimensions: [{ field: "providedModelName" }],
    metrics: [{ measure: "totalCost", aggregation: "sum" }],
    filters: [
      ...mapLegacyUiTableFilterToView("observations", userAndEnvFilterState),
      {
        column: "type",
        operator: "=",
        value: "GENERATION",
        type: "string",
      },
      {
        column: "providedModelName",
        operator: "any of",
        value: selectedModels,
        type: "stringOptions",
      },
    ],
    timeDimension: {
      granularity: "auto",
    },
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  // Latency over time query for chart
  const latencyOverTimeQuery: QueryType = {
    view: "observations",
    dimensions: [{ field: "providedModelName" }],
    metrics: [{ measure: "latency", aggregation: "p50" }],
    filters: [
      ...mapLegacyUiTableFilterToView("observations", userAndEnvFilterState),
      {
        column: "type",
        operator: "=",
        value: "GENERATION",
        type: "string",
      },
      {
        column: "providedModelName",
        operator: "any of",
        value: selectedModels,
        type: "stringOptions",
      },
    ],
    timeDimension: {
      granularity: "auto",
    },
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  // Execute core queries
  const costResult = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: modelCostQuery,
    },
    {
      enabled: !isLoading && selectedModels.length > 0,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const latencyResult = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: modelLatencyQuery,
    },
    {
      enabled: !isLoading && selectedModels.length > 0,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const costOverTimeResult = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: costOverTimeQuery,
    },
    {
      enabled: !isLoading && selectedModels.length > 0,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const latencyOverTimeResult = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: latencyOverTimeQuery,
    },
    {
      enabled: !isLoading && selectedModels.length > 0,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  // Process chart data
  const costOverTime =
    costOverTimeResult.data && selectedModels.length > 0
      ? fillMissingValuesAndTransform(
          extractTimeSeriesData(
            costOverTimeResult.data as DatabaseRow[],
            "time_dimension",
            [
              {
                uniqueIdentifierColumns: [{ accessor: "providedModelName" }],
                valueColumn: "sum_totalCost",
              },
            ],
          ),
          selectedModels,
        )
      : [];

  const latencyOverTime =
    latencyOverTimeResult.data && selectedModels.length > 0
      ? fillMissingValuesAndTransform(
          extractTimeSeriesData(
            latencyOverTimeResult.data as DatabaseRow[],
            "time_dimension",
            [
              {
                uniqueIdentifierColumns: [{ accessor: "providedModelName" }],
                valueColumn: "p50_latency",
              },
            ],
          ),
          selectedModels,
        )
      : [];

  // Combine all metrics into a single array of model data
  const modelMetrics: ModelPerformanceMetrics[] = selectedModels.map(
    (model) => {
      const costData = costResult.data?.find(
        (item) => item.providedModelName === model,
      );

      const latencyData = latencyResult.data?.find(
        (item) => item.providedModelName === model,
      );

      return {
        model,
        // Cost metrics
        totalCost: costData?.sum_totalCost
          ? (costData.sum_totalCost as number)
          : 0,
        averageCost: costData?.avg_totalCost
          ? (costData.avg_totalCost as number)
          : 0,
        // Latency metrics
        p50Latency: latencyData?.p50_latency
          ? (latencyData.p50_latency as number)
          : 0,
        p95Latency: latencyData?.p95_latency
          ? (latencyData.p95_latency as number)
          : 0,
      };
    },
  );

  // Find the "best" model for each metric
  const lowestCostModel =
    [...modelMetrics].sort((a, b) => a.totalCost - b.totalCost)[0]?.model ?? "";

  const fastestModel =
    [...modelMetrics].sort((a, b) => a.p50Latency - b.p50Latency)[0]?.model ??
    "";

  // Format values
  const latencyFormatter = (value: number) => `${value.toFixed(2)}s`;
  const costFormatter = (value: number) => totalCostDashboardFormatted(value);

  const isQueryLoading = Boolean(
    isLoading ||
      costResult.isLoading ||
      latencyResult.isLoading ||
      costOverTimeResult.isLoading ||
      latencyOverTimeResult.isLoading,
  );

  // Create tab data with proper string titles instead of JSX elements
  const tabData = [
    {
      icon: <Calculator className="mr-2 h-4 w-4" />,
      title: "Cost Comparison",
      chart: costOverTime,
      formatter: costFormatter,
      metric: "Cost efficiency",
      bestModel: lowestCostModel,
    },
    {
      icon: <Clock className="mr-2 h-4 w-4" />,
      title: "Latency Comparison",
      chart: latencyOverTime,
      formatter: latencyFormatter,
      metric: "Response speed",
      bestModel: fastestModel,
    },
  ];

  return (
    <DashboardCard
      className={className}
      title="Model Performance Comparison"
      description="Compare models across cost and latency metrics"
      isLoading={Boolean(isQueryLoading && selectedModels.length > 0)}
      headerRight={
        <div className="flex items-center gap-2">
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
      {selectedModels.length === 0 ? (
        <div className="flex h-[300px] items-center justify-center">
          <p className="text-muted-foreground">Select models to compare</p>
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            {modelMetrics.length > 0 &&
              modelMetrics.map((metrics) => (
                <div
                  key={metrics.model}
                  className="rounded-lg border border-border p-4"
                >
                  <div className="mb-3 flex flex-col gap-2">
                    <h3
                      className="truncate font-semibold"
                      title={metrics.model}
                    >
                      {metrics.model}
                    </h3>
                    <div className="flex flex-wrap gap-1">
                      {metrics.model === lowestCostModel && (
                        <Badge
                          variant="outline"
                          className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
                        >
                          <Calculator className="mr-1 h-3 w-3" /> Best cost
                        </Badge>
                      )}
                      {metrics.model === fastestModel && (
                        <Badge
                          variant="outline"
                          className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                        >
                          <Clock className="mr-1 h-3 w-3" /> Fastest
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Total Cost
                      </p>
                      <p className="text-sm font-medium">
                        {costFormatter(metrics.totalCost)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Avg. Cost</p>
                      <p className="text-sm font-medium">
                        {costFormatter(metrics.averageCost)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        p50 Latency
                      </p>
                      <p className="text-sm font-medium">
                        {latencyFormatter(metrics.p50Latency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        p95 Latency
                      </p>
                      <p className="text-sm font-medium">
                        {latencyFormatter(metrics.p95Latency)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
          </div>

          <TabComponent
            tabs={tabData.map((item) => ({
              tabTitle: item.title,
              content: (
                <>
                  {item.bestModel && (
                    <TotalMetric
                      metric={`Best for ${item.metric}: ${item.bestModel}`}
                      description={`Recommended model for ${item.metric.toLowerCase()}`}
                      className="mb-4"
                    >
                      <DocPopup
                        description={`This model has the best ${item.metric.toLowerCase()} metrics in the selected time period.`}
                        href="https://langfuse.com/docs/model-usage-and-cost"
                      />
                    </TotalMetric>
                  )}
                  {isEmptyTimeSeries({ data: item.chart }) || isQueryLoading ? (
                    <NoDataOrLoading isLoading={Boolean(isQueryLoading)} />
                  ) : (
                    <BaseTimeSeriesChart
                      agg={agg}
                      data={item.chart}
                      showLegend={true}
                      connectNulls={true}
                      valueFormatter={item.formatter}
                    />
                  )}
                </>
              ),
            }))}
          />
        </>
      )}
    </DashboardCard>
  );
};
