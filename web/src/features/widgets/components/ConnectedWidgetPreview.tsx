import { useMemo, type ComponentProps } from "react";
import { type WidgetChartCard } from "./WidgetChartCard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { api } from "@/src/utils/api";
import { getResultUnit } from "@langfuse/shared/query";
import { usePreparedWidgetChart } from "./usePreparedWidgetChart";
import {
  VisualizationFrame,
  type Visualization,
} from "@/src/components/design-system/charts/internal/VisualizationFrame/VisualizationFrame";
import { isChartDataEmpty } from "@/src/features/widgets/chart-library/isChartDataEmpty";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { isTimeSeriesChart } from "@/src/features/widgets/chart-library/utils";
import {
  getWidgetMetricPresentation,
  getWidgetMissingBucketValue,
} from "@/src/features/widgets/utils";
import { type WidgetFormState } from "./WidgetForm";
import { getWidgetChartQueryState } from "../fns/getWidgetChartQueryState";
import { toWidgetChartDataPoint } from "../fns/toWidgetChartDataPoint";

type ConnectedWidgetPreviewProps = Pick<
  WidgetFormState,
  | "projectId"
  | "query"
  | "viewVersion"
  | "queryValidation"
  | "chartType"
  | "values"
  | "selectedAggregation"
  | "selectedDimension"
  | "selectedMeasure"
  | "selectedView"
  | "effectiveSort"
  | "previewSortState"
  | "pivotDimensionFields"
  | "displayName"
  | "displayDescription"
>;

export function ConnectedWidgetPreview(props: ConnectedWidgetPreviewProps) {
  const {
    viewVersion,
    queryValidation,
    chartType,
    values,
    selectedAggregation,
    selectedMeasure,
    selectedView,
    effectiveSort,
    previewSortState,
    pivotDimensionFields,
    displayName,
    displayDescription,
  } = props;
  const {
    queryResult,
    chartLoadingState,
    loadingProgress,
    transformedData,
    chartPresentation,
  } = useWidgetPreviewData(props);

  const showEmpty =
    (isTimeSeriesChart(chartType) ||
      chartType === "NUMBER" ||
      chartType === "HISTOGRAM" ||
      chartType === "PIVOT_TABLE") &&
    (chartType === "NUMBER" || !queryResult.isPending) &&
    isChartDataEmpty(transformedData);

  const chartConfig: NonNullable<
    ComponentProps<typeof WidgetChartCard>["chartConfig"]
  > = (() => {
    if (chartType === "PIVOT_TABLE") {
      return {
        type: chartType,
        dimensions: pivotDimensionFields,
        row_limit: values.chart.rowLimit,
        metrics: values.metrics.map(
          (metric) => `${metric.aggregation}_${metric.measure}`,
        ),
        units: values.metrics.map((metric) =>
          getResultUnit(
            selectedView,
            metric.measure,
            metric.aggregation,
            viewVersion,
          ),
        ),
        defaultSort: effectiveSort ?? undefined,
      };
    }
    if (chartType === "HISTOGRAM") {
      return {
        type: chartType,
        bins: values.chart.bins,
        unit: getResultUnit(
          selectedView,
          selectedMeasure,
          selectedAggregation,
          viewVersion,
        ),
      };
    }
    return {
      type: chartType,
      row_limit: values.chart.rowLimit,
      unit: getResultUnit(
        selectedView,
        selectedMeasure,
        selectedAggregation,
        viewVersion,
      ),
    };
  })();

  const active =
    queryValidation.valid &&
    Boolean(queryResult.data || chartLoadingState.isLoading) &&
    !showEmpty;
  const prepared = usePreparedWidgetChart({
    chartType,
    data: transformedData,
    chartConfig,
    rowLimit: values.chart.rowLimit,
    active,
    label: chartPresentation?.label,
    metricFormatter: chartPresentation?.metricFormatter,
    missingValue: getWidgetMissingBucketValue(selectedAggregation),
    sortState: chartType === "PIVOT_TABLE" ? previewSortState : undefined,
  });
  const { confirmation } = prepared;
  const content: Visualization = (() => {
    const { visualization } = prepared;
    if (visualization.type === "table" && !visualization.rows.length) {
      if (queryResult.isPending)
        return { type: "loading", progress: loadingProgress };
      return {
        type: "error",
        message: "Unable to process data for pivot table",
      };
    }
    if (visualization.type === "histogram" && !visualization.data.length)
      return { type: "empty", message: "No data available" };
    return visualization;
  })();

  return (
    <div className="w-2/3">
      <Card className="flex aspect-video flex-col">
        <CardHeader>
          <CardTitle className="truncate" title={displayName}>
            {displayName}
          </CardTitle>
          <CardDescription className="truncate" title={displayDescription}>
            {displayDescription}
          </CardDescription>
        </CardHeader>
        {!queryValidation.valid && (
          <CardContent>
            <div className="flex h-[300px] items-center justify-center">
              <VisualizationFrame
                content={{ type: "error", message: queryValidation.reason }}
              />
            </div>
          </CardContent>
        )}
        {queryValidation.valid &&
          (queryResult.data || chartLoadingState.isLoading) && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="relative min-h-0 flex-1">
                {confirmation && <VisualizationFrame content={confirmation} />}
                {!confirmation && showEmpty && (
                  <VisualizationFrame
                    content={
                      queryResult.isPending
                        ? { type: "loading", progress: { type: "spinner" } }
                        : { type: "empty" }
                    }
                  />
                )}
                {!confirmation && !showEmpty && (
                  <VisualizationFrame content={content} />
                )}
                {chartLoadingState.isLoading && (
                  <div className="bg-background/80 absolute inset-0 z-20 backdrop-blur-xs">
                    <VisualizationFrame
                      content={
                        chartLoadingState.showSpinner
                          ? {
                              type: "loading",
                              showHintImmediately:
                                chartLoadingState.showHintImmediately,
                              hintText: chartLoadingState.hintText,
                              progress: loadingProgress,
                            }
                          : {
                              type: "error",
                              message:
                                chartLoadingState.hintText ??
                                "Unable to load chart data",
                            }
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        {queryValidation.valid &&
          !queryResult.data &&
          !chartLoadingState.isLoading && (
            <CardContent>
              <div className="flex h-[300px] items-center justify-center">
                <VisualizationFrame
                  content={{ type: "empty", message: "Waiting for input" }}
                />
              </div>
            </CardContent>
          )}
      </Card>
    </div>
  );
}

function useWidgetPreviewData({
  projectId,
  query,
  viewVersion,
  queryValidation,
  chartType,
  values,
  selectedAggregation,
  selectedDimension,
  selectedMeasure,
  selectedView,
}: ConnectedWidgetPreviewProps) {
  const queryResult = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query,
      version: viewVersion,
    },
    {
      trpc: { context: { skipBatch: true } },
      meta: { silentHttpCodes: [412, 422] },
      enabled: queryValidation.valid,
    },
  );

  const { chartLoadingState, loadingProgress } = getWidgetChartQueryState({
    isPending: queryResult.isPending,
    isError: queryResult.isError,
    error: null,
    progress: null,
    usesBackendProgress: false,
  });

  const transformedData: DataPoint[] = useMemo(
    () =>
      queryResult.data?.map((item) => {
        const timeDimension =
          typeof item["time_dimension"] === "string"
            ? item["time_dimension"]
            : undefined;
        if (chartType === "PIVOT_TABLE") {
          return {
            ...item,
            dimension:
              values.dimensions.length > 0
                ? values.dimensions[0].field
                : "dimension",
            metric: 0,
            time_dimension: timeDimension,
          };
        }
        const metricField = `${selectedAggregation}_${selectedMeasure}`;
        return toWidgetChartDataPoint({
          metricValue: item[metricField],
          metricField,
          aggregation: selectedAggregation,
          dimensionValue:
            selectedDimension === "none" ? undefined : item[selectedDimension],
          timeDimension,
          isTimeSeries: isTimeSeriesChart(chartType),
          dimensionLabelMap: undefined,
          normalizeHistogram: true,
        });
      }) ?? [],
    [
      queryResult.data,
      selectedAggregation,
      selectedDimension,
      selectedMeasure,
      chartType,
      values.dimensions,
    ],
  );

  const chartPresentation = useMemo(() => {
    if (chartType === "PIVOT_TABLE") return undefined;
    return getWidgetMetricPresentation({
      metric: { measure: selectedMeasure, agg: selectedAggregation },
      view: selectedView,
      version: viewVersion,
    });
  }, [
    selectedAggregation,
    chartType,
    selectedMeasure,
    selectedView,
    viewVersion,
  ]);

  return {
    queryResult,
    chartLoadingState,
    loadingProgress,
    transformedData,
    chartPresentation,
  };
}
