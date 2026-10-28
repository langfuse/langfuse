import { useMemo, type ComponentProps } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { AlertCircle } from "@langfuse/icons";
import { api } from "@/src/utils/api";
import { getResultUnit } from "@langfuse/shared/query";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { isTimeSeriesChart } from "@/src/features/widgets/chart-library/utils";
import { ChartLoadingState } from "@/src/features/widgets/chart-library/ChartLoadingState";
import {
  getChartLoadingProgress,
  getChartLoadingStateProps,
} from "@/src/features/widgets/chart-library/chartLoadingStateUtils";
import {
  formatMetricName,
  getWidgetMetricPresentation,
  getWidgetMissingBucketValue,
} from "@/src/features/widgets/utils";
import { type WidgetFormState } from "./WidgetForm";

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

  const chartConfig: ComponentProps<typeof Chart>["chartConfig"] = (() => {
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
              <div className="w-full max-w-sm">
                <Alert variant="destructive" icon={AlertCircle}>
                  <Alert.Title>Invalid query</Alert.Title>
                  <Alert.Description>
                    {queryValidation.reason}
                  </Alert.Description>
                </Alert>
              </div>
            </div>
          </CardContent>
        )}
        {queryValidation.valid &&
          (queryResult.data || chartLoadingState.isLoading) && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="relative min-h-0 flex-1">
                <Chart
                  chartType={chartType}
                  data={transformedData}
                  config={
                    chartPresentation
                      ? { metric: { label: chartPresentation.label } }
                      : undefined
                  }
                  rowLimit={values.chart.rowLimit}
                  chartConfig={chartConfig}
                  sortState={
                    chartType === "PIVOT_TABLE" ? previewSortState : undefined
                  }
                  onSortChange={undefined}
                  isLoading={queryResult.isPending}
                  metricFormatter={chartPresentation?.metricFormatter}
                  missingValue={getWidgetMissingBucketValue(
                    selectedAggregation,
                  )}
                />
                {chartLoadingState.isLoading && (
                  <ChartLoadingState
                    showSpinner={chartLoadingState.showSpinner}
                    showHintImmediately={chartLoadingState.showHintImmediately}
                    hintText={chartLoadingState.hintText}
                    progress={loadingProgress}
                    className="bg-background/80 absolute inset-0 z-20 backdrop-blur-xs"
                  />
                )}
              </div>
            </div>
          )}
        {queryValidation.valid &&
          !queryResult.data &&
          !chartLoadingState.isLoading && (
            <CardContent>
              <div className="flex h-[300px] items-center justify-center">
                <p className="text-muted-foreground">
                  Waiting for Input / Loading...
                </p>
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

  const chartLoadingState = getChartLoadingStateProps({
    isPending: queryResult.isPending,
    isError: queryResult.isError,
  });
  const loadingProgress = getChartLoadingProgress({
    isPending: queryResult.isPending,
    progress: null,
    useBackendProgress: false,
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
        const metric = item[metricField];
        const dimensionField = selectedDimension;
        const dimensionValue = item[dimensionField];
        const isTimeSeries = isTimeSeriesChart(chartType);

        const isFillerMetricValue =
          metric == null ||
          (getWidgetMissingBucketValue(selectedAggregation) === "zero" &&
            Number(metric) === 0);
        if (
          isTimeSeries &&
          dimensionField !== "none" &&
          (dimensionValue === null || dimensionValue === "") &&
          isFillerMetricValue
        ) {
          return {
            dimension: undefined,
            metric: null,
            time_dimension: timeDimension,
          };
        }

        return {
          dimension:
            dimensionValue !== undefined && dimensionField !== "none"
              ? (() => {
                  const val = dimensionValue;
                  if (val === null || val === undefined || val === "")
                    return "n/a";
                  if (typeof val === "string") return val;
                  if (Array.isArray(val)) return val.join(", ");
                  return String(val);
                })()
              : formatMetricName(metricField),
          metric: (() => {
            if (Array.isArray(metric)) {
              return metric.map((bucket: unknown) =>
                Array.isArray(bucket) ? bucket.map(Number) : [],
              );
            }
            if (isTimeSeries && metric == null) return null;
            return Number(metric || 0);
          })(),
          time_dimension: timeDimension,
        };
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
