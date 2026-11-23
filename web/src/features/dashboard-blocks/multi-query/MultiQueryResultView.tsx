import { prepareMultiQueryTimeSeriesData } from "./multiQueryTimeSeries";
import { type ChartLegendInteraction } from "@/src/components/design-system/charts/LineChart/LineChart";
import {
  multiQueryFormatter,
  prepareMultiQueryUnitVisualization,
} from "./multiQueryPresentation";
import { useState } from "react";
import { type MultiQueryConfig } from "@langfuse/shared";
import { GripVerticalIcon, MoreVerticalIcon } from "@langfuse/icons";
import { type DataCardActions } from "@/src/components/design-system/DataCard/DataCard";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { PaginationBar } from "@/src/components/design-system/PaginationBar/PaginationBar";
import {
  VisualizationFrame,
  type Visualization,
} from "@/src/components/design-system/charts/internal/VisualizationFrame/VisualizationFrame";
import { usePreparedWidgetChart } from "@/src/features/widgets/components/usePreparedWidgetChart";
import { isTimeSeriesChart } from "@/src/features/widgets/chart-library/utils";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { type useMultiQueryWidget } from "./useMultiQueryWidget";
import { type MultiQuerySeries, type MultiQueryValue } from "./multiQueryModel";

const unitLabel = (unit: string | undefined) =>
  ({
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
type MultiQueryRuntime = ReturnType<typeof useMultiQueryWidget>;

const legendActions = {
  toggle: "multi_query_legend_toggled",
  select_all: "multi_query_legend_selected_all",
  clear_all: "multi_query_legend_cleared_all",
} satisfies Record<ChartLegendInteraction, string>;

export function MultiQueryResultView({
  config,
  runtime,
  actions,
}: {
  config: MultiQueryConfig;
  runtime: MultiQueryRuntime;
  actions?: DataCardActions;
}) {
  const [tab, setTab] = useState("chart");
  const [page, setPage] = useState({ pageIndex: 0, pageSize: 50 });
  const capture = usePostHogClientCapture();
  const result = runtime.result;
  const groups = [...new Set(result.series.map((series) => series.unit))];
  const activeConfig = runtime.config;
  const pageIndex = Math.min(
    page.pageIndex,
    Math.max(0, Math.ceil(result.values.length / page.pageSize) - 1),
  );
  const captureView = (action: string) =>
    capture("dashboard:block_interaction", {
      blockKind: "multiQuery",
      action,
      isV4:
        runtime.plan?.queries.some((query) => query.version === "v2") ?? false,
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
    rows: result.values
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
  const showTable =
    tab === "data" || activeConfig.display.chartType === "PIVOT_TABLE";
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
    if (showTable) return data;
    if (result.values.length === 0)
      return {
        type: "empty",
        message: "No matching data",
        description: "Try a wider date range or different series filters.",
      };
    if (!result.values.some((row) => row.value !== null))
      return {
        type: "empty",
        message: "No measured value",
        description:
          "The queries returned no measured values. Data retains empty buckets and evaluation counts.",
      };
    if (
      activeConfig.display.chartType === "NUMBER" &&
      (result.series.length !== 1 || result.values.length !== 1)
    )
      return {
        type: "empty",
        message: "A big number needs one ungrouped metric",
        description:
          "Choose a view with one metric, remove its grouping, or select a table.",
      };
    if (activeConfig.display.chartType === "PIE" && groups.length > 1)
      return {
        type: "empty",
        message: "A pie chart needs a common unit",
        description:
          "Choose a view with compatible series, or select a bar, line or table.",
      };
    if (
      activeConfig.display.chartType === "HISTOGRAM" &&
      (result.series.length !== 1 ||
        result.series.some((series) => series.aggregation !== "histogram"))
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
    <section
      className="ph-no-capture group bg-background relative flex h-full min-h-0 flex-col rounded-lg border"
      aria-label={config.title}
    >
      <div className="flex shrink-0 flex-col gap-2 p-4 pb-2">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <h3
            className="min-w-0 truncate text-base font-bold"
            title={config.title}
          >
            {config.title}
          </h3>
          {actions ? (
            <div className="flex shrink-0 items-center gap-1">
              {actions.draggable ? (
                <GripVerticalIcon
                  size="base"
                  __rawClassName="drag-handle hidden cursor-grab active:cursor-grabbing lg:block"
                />
              ) : null}
              {actions.buttons?.map((action) => (
                <IconButton
                  key={action.id}
                  label={action.label}
                  icon={action.icon}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  size="sm"
                />
              ))}
              {actions.menu && actions.menu.length > 0 ? (
                <DropdownMenu
                  noCapture
                  items={actions.menu}
                  ariaLabel="Chart actions"
                >
                  {({ getTriggerProps }) => (
                    <IconButton
                      {...getTriggerProps()}
                      label="Chart actions"
                      icon={MoreVerticalIcon}
                      size="sm"
                    />
                  )}
                </DropdownMenu>
              ) : null}
            </div>
          ) : null}
        </div>
        {config.description ? (
          <p className="text-muted-foreground line-clamp-2 text-sm">
            {config.description}
          </p>
        ) : null}
        {config.views && config.views.length > 0 ? (
          <SelectInput
            noCapture
            aria-label="Chart view"
            placeholder="All series"
            value={runtime.viewId}
            options={[
              { value: "all", label: "All series" },
              ...config.views.map((view) => ({
                value: view.id,
                label: view.label,
              })),
            ]}
            onValueChange={(value) => {
              runtime.selectView(value);
              captureView("multi_query_view_changed");
            }}
          />
        ) : null}
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value);
            captureView(
              value === "data"
                ? "multi_query_data_opened"
                : "multi_query_chart_opened",
            );
          }}
        >
          <Tabs.List variant="underline" aria-label="Chart result views">
            <Tabs.Trigger
              value="chart"
              label={
                activeConfig.display.chartType === "PIVOT_TABLE"
                  ? "Table"
                  : "Chart"
              }
            />
            <Tabs.Trigger value="data" label="Data" />
          </Tabs.List>
        </Tabs>
      </div>
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
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        {content ? (
          <VisualizationFrame content={content} />
        ) : (
          groups.map((unit) => (
            <MultiQueryUnitChart
              key={unit ?? "number"}
              config={activeConfig}
              unit={unit}
              series={result.series.filter((series) => series.unit === unit)}
              values={result.values}
              bucketTimes={result.bucketTimes}
              label={groups.length > 1 ? unitLabel(unit) : undefined}
              onAfterLegendInteraction={(action) =>
                captureView(legendActions[action])
              }
            />
          ))
        )}
      </div>
      {showTable && result.values.length > 0 ? (
        <PaginationBar
          mode="offset"
          totalCount={result.values.length}
          state={{ ...page, pageIndex }}
          onChange={setPage}
          pageSizeOptions={[25, 50, 100]}
        />
      ) : null}
    </section>
  );
}

function MultiQueryUnitChart({
  config,
  unit,
  series,
  values,
  bucketTimes,
  label,
  onAfterLegendInteraction,
}: {
  config: MultiQueryConfig;
  unit: string | undefined;
  series: MultiQuerySeries[];
  values: MultiQueryValue[];
  bucketTimes: string[];
  label: string | undefined;
  onAfterLegendInteraction: (action: ChartLegendInteraction) => void;
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
    legendPosition: config.display.legend === false ? "none" : "below",
    legendInteraction: "toggle",
    zeroBaseline: true,
    colorBarsByCategory: true,
    rowLimit: data.length,
  });
  const content = prepareMultiQueryUnitVisualization(
    config,
    series,
    rows,
    prepared,
    onAfterLegendInteraction,
  );
  return (
    <div className="flex h-64 min-h-64 min-w-0 shrink-0 flex-col gap-1 only:h-[var(--multi-query-plot-height,16rem)] only:min-h-[var(--multi-query-plot-height,16rem)]">
      {label ? (
        <h4 className="text-muted-foreground shrink-0 text-xs font-medium">
          {label}
        </h4>
      ) : null}
      <VisualizationFrame content={content} />
    </div>
  );
}
