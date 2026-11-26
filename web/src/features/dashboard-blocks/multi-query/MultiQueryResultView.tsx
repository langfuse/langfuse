import { prepareMultiQueryTimeSeriesData } from "./multiQueryTimeSeries";
import { SeriesLegend } from "./SeriesLegend";
import {
  multiQueryFormatter,
  prepareMultiQueryUnitVisualization,
} from "./multiQueryPresentation";
import { useMemo, useState } from "react";
import { groupedMetricTable, returnedRowsSubtotal } from "./multiQueryTable";
import { type MultiQueryTab } from "@langfuse/shared/dashboards";
import { PaginationBar } from "@/src/components/design-system/PaginationBar/PaginationBar";
import {
  VisualizationFrame,
  type Visualization,
} from "@/src/components/design-system/charts/internal/VisualizationFrame/VisualizationFrame";
import { usePreparedWidgetChart } from "@/src/features/widgets/components/usePreparedWidgetChart";
import {
  isTimeSeriesChart,
  toFullMetricString,
} from "@/src/features/widgets/chart-library/utils";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { type useMultiQueryWidget } from "./useMultiQueryWidget";
import { type MultiQuerySeries, type MultiQueryValue } from "./multiQueryModel";

const unitLabel = (unit: string | undefined) =>
  ({
    percent: "Percent",
    USD: "US dollars",
    milliseconds: "Duration",
    integer: "Count",
    tokens: "Tokens",
    "tokens/s": "Tokens per second",
    observations: "Observations",
    traces: "Traces",
    scores: "Score records",
  })[unit ?? ""] ??
  unit ??
  "Value";
type MultiQueryRuntime = Pick<
  ReturnType<typeof useMultiQueryWidget>,
  | "hiddenSeries"
  | "toggleSeries"
  | "result"
  | "isV4"
  | "validationError"
  | "refresh"
  | "hasVisibleMetrics"
  | "plan"
>;

export function MultiQueryResultView({
  config,
  runtime,
  asTable = false,
}: {
  config: MultiQueryTab;
  runtime: MultiQueryRuntime;
  asTable?: boolean;
}) {
  const hidden = runtime.hiddenSeries;
  const [page, setPage] = useState({ pageIndex: 0, pageSize: 50 });
  const capture = usePostHogClientCapture();
  const result = runtime.result;
  const showTable = asTable || config.display.chartType === "PIVOT_TABLE";
  const canToggle =
    !showTable &&
    config.display.chartType !== "NUMBER" &&
    config.display.chartType !== "HISTOGRAM" &&
    config.display.legend !== false &&
    result.series.length > 0;
  const visibleSeries = canToggle
    ? result.series.filter((item) => !hidden.has(item.id))
    : result.series;
  const visibleValues = canToggle
    ? result.values.filter((row) => !hidden.has(row.seriesId))
    : result.values;
  const groups = new Set(visibleSeries.map((item) => item.unit));
  const groupedTable = useMemo(
    () =>
      showTable
        ? groupedMetricTable(
            result.values,
            config.display.hideUnattributedRows,
            result.status === "complete"
              ? {
                  queries: config.queries,
                  rowLimit: config.display.rowLimit ?? 100,
                }
              : undefined,
          )
        : undefined,
    [
      showTable,
      result.values,
      result.status,
      config.display.hideUnattributedRows,
      config.display.rowLimit,
      config.queries,
    ],
  );
  const detailedValues =
    showTable && !groupedTable && config.display.hideUnattributedRows
      ? result.values.filter(
          (row) => !Object.values(row.dimensions).includes(null),
        )
      : result.values;
  const tableCount = groupedTable?.rows.length ?? detailedValues.length;
  const subtotal =
    result.status === "complete"
      ? returnedRowsSubtotal(
          config.queries,
          config.display.subtotalMetric,
          result.values,
        )
      : undefined;
  const pageIndex = Math.min(
    page.pageIndex,
    Math.max(0, Math.ceil(tableCount / page.pageSize) - 1),
  );
  const captureView = (action: string) =>
    capture("dashboard:block_interaction", {
      blockKind: "multiQuery",
      action,
      isV4: runtime.isV4,
    });
  const data: Visualization = {
    type: "table",
    columns: [
      { id: "time", label: "Time" },
      { id: "series", label: "Series" },
      { id: "metric", label: "Metric" },
      { id: "group", label: "Breakdown" },
      { id: "value", label: "Value", align: "right" },
      { id: "unit", label: "Unit" },
      { id: "evaluations", label: "Evaluations", align: "right" },
    ],
    rows: detailedValues
      .slice(pageIndex * page.pageSize, (pageIndex + 1) * page.pageSize)
      .map((row, index) => ({
        id: `${row.seriesId}:${index}`,
        cells: [
          {
            columnId: "time",
            value: row.time ? new Date(row.time).toLocaleString() : "—",
          },
          { columnId: "series", value: row.queryLabel },
          { columnId: "metric", value: row.metricLabel },
          {
            columnId: "group",
            value:
              row.bin ??
              (Object.values(row.dimensions)
                .map((value) => value ?? "Unknown")
                .join(" · ") ||
                "—"),
          },
          {
            columnId: "value",
            value: row.value === null ? "null" : String(row.value),
          },
          { columnId: "unit", value: unitLabel(row.unit) },
          { columnId: "evaluations", value: row.evaluationCount ?? "—" },
        ],
      })),
  };
  const failure =
    runtime.validationError ??
    (result.status === "error"
      ? result.failures
          .map((failure) => `${failure.label}: ${failure.message}`)
          .join(". ")
      : null);
  const content: Visualization | undefined = (() => {
    if (failure)
      return { type: "error", message: failure, onRetry: runtime.refresh };
    if (result.pending && result.values.length === 0)
      return { type: "loading", progress: { type: "spinner" } };
    if (!runtime.hasVisibleMetrics)
      return {
        type: "empty",
        message: "No series selected for display",
        description: "Show a series or a formula in the chart editor.",
      };
    if (showTable) {
      if (!tableCount) return { type: "empty", message: "No matching rows" };
      return groupedTable
        ? {
            type: "table",
            columns: groupedTable.columns,
            rows: groupedTable.rows.slice(
              pageIndex * page.pageSize,
              (pageIndex + 1) * page.pageSize,
            ),
          }
        : data;
    }
    if (result.values.length === 0)
      return {
        type: "empty",
        message: "No matching data",
        description: "Try a wider date range or different series filters.",
      };
    if (visibleSeries.length === 0 && result.series.length > 0)
      return {
        type: "empty",
        message: "All series hidden",
        description: "Select a series in the legend to show it.",
      };
    if (groups.size > 1)
      return {
        type: "empty",
        message: "These series use different units",
        description:
          "Move a series to its own tab in the editor, or choose a table to see the values together.",
      };
    if (!visibleValues.some((row) => row.value !== null))
      return {
        type: "empty",
        message: "No measured value",
        description: "Try a different time range or check the series filters.",
      };
    if (
      config.display.chartType === "NUMBER" &&
      (visibleSeries.length !== 1 || visibleValues.length !== 1)
    )
      return {
        type: "empty",
        message: "A big number needs one ungrouped metric",
        description:
          "Plot a single metric without a breakdown, or choose a table.",
      };
    if (
      config.display.chartType === "HISTOGRAM" &&
      (visibleSeries.length !== 1 ||
        visibleSeries.some((series) => series.aggregation !== "histogram"))
    )
      return {
        type: "empty",
        message: "Choose one histogram metric",
        description:
          "Use one series with a histogram aggregation and no grouping.",
      };
    return undefined;
  })();
  return (
    <div
      className="ph-no-capture flex min-h-0 flex-1 flex-col"
      aria-label={config.label}
    >
      {result.failures.length > 0 && result.status !== "error" ? (
        <div
          role="alert"
          className="bg-light-yellow shrink-0 px-4 py-2 text-xs"
        >
          <p className="font-medium">
            Partial result · {result.failures.length} series failed
          </p>
          {result.failures.map((failure) => (
            <p key={failure.id}>
              {failure.label}: {failure.message}
            </p>
          ))}
        </div>
      ) : null}
      {result.pending && result.values.length > 0 ? (
        <p
          role="status"
          className="text-muted-foreground shrink-0 px-4 py-1 text-xs"
        >
          Loading the remaining series…
        </p>
      ) : null}
      {runtime.plan && runtime.plan.warnings.length > 0 ? (
        <details className="text-muted-foreground shrink-0 px-4 py-1 text-xs">
          <summary className="cursor-pointer">Filter scope</summary>
          {runtime.plan.warnings.map((warning, index) => (
            <p key={index}>{warning}</p>
          ))}
        </details>
      ) : null}
      {subtotal && (
        <div className="shrink-0 px-4 pb-1">
          <p className="text-xl font-bold tabular-nums">
            {toFullMetricString(
              multiQueryFormatter(subtotal.unit)(subtotal.value, {
                style: "compact",
              }),
            )}
          </p>
          <p className="text-muted-foreground text-xs">
            {subtotal.label} · Sum of returned groups
          </p>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        {content ? (
          <VisualizationFrame content={content} />
        ) : (
          <MultiQueryUnitChart
            config={config}
            unit={visibleSeries[0]?.unit}
            series={visibleSeries}
            values={visibleValues}
            bucketTimes={result.bucketTimes}
          />
        )}
      </div>
      {!content && config.display.chartType === "NUMBER" && (
        <p className="text-muted-foreground px-4 pb-2 text-center text-sm">
          {visibleSeries[0]?.label}
        </p>
      )}
      {canToggle && (
        <SeriesLegend
          series={result.series}
          hidden={hidden}
          onToggle={(id) => {
            runtime.toggleSeries(id);
            captureView("multi_query_legend_toggled");
          }}
        />
      )}
      {showTable && tableCount > page.pageSize ? (
        <PaginationBar
          mode="offset"
          totalCount={tableCount}
          state={{ ...page, pageIndex }}
          onChange={setPage}
          pageSizeOptions={[25, 50, 100]}
        />
      ) : null}
    </div>
  );
}

function MultiQueryUnitChart({
  config,
  unit,
  series,
  values,
  bucketTimes,
}: {
  config: MultiQueryTab;
  unit: string | undefined;
  series: MultiQuerySeries[];
  values: MultiQueryValue[];
  bucketTimes: string[];
}) {
  const ids = new Set(series.map((series) => series.id));
  const rows = values.filter((row) => ids.has(row.seriesId));
  const timeSeries = isTimeSeriesChart(config.display.chartType);
  const chartData = prepareMultiQueryTimeSeriesData(
    series,
    values,
    timeSeries ? bucketTimes : [],
  );
  const { data } = chartData;
  const colors = Object.fromEntries(
    series.map((series) => [
      series.id,
      { label: series.label, color: series.color },
    ]),
  );
  const prepared = usePreparedWidgetChart({
    chartType: config.display.chartType,
    active:
      config.display.chartType !== "HISTOGRAM" &&
      config.display.chartType !== "NUMBER",
    data,
    config: colors,
    metricFormatter: multiQueryFormatter(unit),
    missingValue: chartData.missingValue,
    legendPosition: "none",
    zeroBaseline: true,
    colorBarsByCategory: true,
    showValueLabels: config.display.showValueLabels,
    rowLimit: data.length,
  });
  const content = prepareMultiQueryUnitVisualization(
    config,
    series,
    rows,
    prepared,
  );
  return (
    <div className="flex h-64 min-h-64 min-w-0 shrink-0 flex-col gap-1 only:h-[var(--multi-query-plot-height,16rem)] only:min-h-[var(--multi-query-plot-height,16rem)]">
      <VisualizationFrame content={content} />
    </div>
  );
}
