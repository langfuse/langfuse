import { useState, type ComponentProps, type ComponentType } from "react";
import { type StudioWidgetConfig } from "@langfuse/shared";
import {
  type DataCard,
  type DataCardActions,
} from "@/src/components/design-system/DataCard/DataCard";
import { type Visualization } from "@/src/components/design-system/charts/internal/VisualizationFrame/VisualizationFrame";
import { usePreparedWidgetChart } from "@/src/features/widgets/components/usePreparedWidgetChart";
import {
  type prepareStudioChart,
  applyStudioSeriesPresentation,
  prepareStudioData,
  studioMetricFormatter,
  formatStudioValue,
} from "./prepareStudioChart";
import { useDashboardStudioCapture } from "./analytics";
import { ScoreTag } from "@/src/components/ScoreTag";
import { describeStudioScores } from "./studioScoreDescription";
import { PaginationBar } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { type useStudioWidgetResult } from "./useStudioWidgetResult";
import { useIsMobile } from "@/src/hooks/use-mobile";

export type StudioWidgetResultProps = {
  config: StudioWidgetConfig;
  runtime: ReturnType<typeof useStudioWidgetResult>;
  prepared: ReturnType<typeof prepareStudioChart>;
};

export type StudioWidgetCardResultProps = StudioWidgetResultProps & {
  actions?: DataCardActions;
  onHiddenSeriesChange?: (ids: string[]) => void;
} & {
  queryView?: {
    value: string;
    onChange: (value: string) => void;
    configuredQueryIds: string[] | undefined;
  };
};

export type StudioWidgetResultFrameProps = ComponentProps<typeof DataCard>;

export function StudioWidgetResultPresentation({
  config,
  runtime,
  prepared,
  Frame,
  actions,
  onHiddenSeriesChange,
  queryView,
}: StudioWidgetCardResultProps & {
  Frame: ComponentType<StudioWidgetResultFrameProps>;
}) {
  const [view, setView] = useState("chart");
  const [focusedBucket, setFocusedBucket] = useState<string>();
  const [dataView, setDataView] = useState<{
    scope: "rows" | "summaries";
    reference: string;
    pageIndex: number;
    pageSize: number;
  }>({ scope: "rows", reference: "all", pageIndex: 0, pageSize: 50 });
  const [selectionError, setSelectionError] = useState<string>();
  const isMobile = useIsMobile();
  const result = runtime.result;
  const track = useDashboardStudioCapture(runtime.version === "v2");
  const selectedQuery = queryView?.value ?? "configured";
  const effectiveConfig = config;
  const scoreSeries =
    prepared.visibleSeries.length === 1
      ? prepared.visibleSeries[0]?.id
      : undefined;
  const scoreBuckets =
    scoreSeries && config.display.chartType === "LINE_TIME_SERIES"
      ? (result.data?.rows.filter(
          (row) =>
            row.seriesId === scoreSeries &&
            row.time &&
            row.evaluationCount !== undefined,
        ) ?? [])
      : [];
  const focusedScore =
    focusedBucket &&
    scoreBuckets.find(
      (row) =>
        row.time === focusedBucket ||
        String(Date.parse(row.time!)) === focusedBucket,
    );
  const displayedScore =
    focusedScore ||
    scoreBuckets.reduce<(typeof scoreBuckets)[number] | undefined>(
      (latest, row) => (!latest || row.time! > latest.time! ? row : latest),
      undefined,
    );
  const dataScope =
    dataView.scope === "summaries" && result.data?.summaries.length
      ? "summaries"
      : "rows";
  const audit =
    view === "table"
      ? prepareStudioData(result.data, effectiveConfig, {
          ...dataView,
          scope: dataScope,
          compact: isMobile,
        })
      : undefined;
  const chart = usePreparedWidgetChart({
    sync: scoreBuckets.length
      ? { activeKey: focusedBucket, onActiveKeyChange: setFocusedBucket }
      : undefined,
    chartType: config.display.chartType,
    active: true,
    data: prepared.data,
    config: prepared.colors,
    rowLimit: config.display.rowLimit ?? 100,
    metricFormatter: studioMetricFormatter(prepared.unit),
    legendPosition: config.display.legend === false ? "none" : "below",
    legendLayout:
      !isMobile &&
      config.display.chartType.endsWith("TIME_SERIES") &&
      prepared.visibleSeries.length <= 4
        ? "wrap"
        : undefined,
    legendInteraction: "toggle",
    zeroBaseline: true,
    colorBarsByCategory: true,
    missingValue: "gap",
    onLegendInteraction: (event) =>
      track("legend_interacted", {
        interaction: event.action,
        selectedCount: event.selectedCount,
        scope: "display",
        widgetKind: "query",
      }),
  });
  const content: Visualization = (() => {
    if (result.isPending)
      return { type: "loading", progress: { type: "spinner" } };
    if (result.error)
      return {
        type: "error",
        message: result.error.message,
        onRetry: () => {
          result.refetch();
        },
      };
    if (view === "inspect")
      return {
        type: "table",
        columns: [
          { id: "query", label: "Query" },
          { id: "duration", label: "Duration", align: "right" },
          {
            id: "queries",
            label:
              config.executionMode === "current"
                ? "API requests"
                : "Database queries",
            align: "right",
          },
          { id: "rows", label: "Result rows", align: "right" },
          { id: "read", label: "Rows read", align: "right" },
          { id: "bytes", label: "Bytes read", align: "right" },
          { id: "status", label: "Status" },
        ],
        rows: (result.data?.diagnostics ?? []).map((item) => ({
          id: item.queryId,
          cells: [
            { columnId: "query", value: item.queryId },
            {
              columnId: "duration",
              value:
                config.executionMode === "current"
                  ? "—"
                  : `${Math.round(item.durationMs)} ms`,
            },
            { columnId: "queries", value: item.queryCount },
            { columnId: "rows", value: item.resultRows },
            { columnId: "read", value: item.rowsRead?.toLocaleString() ?? "—" },
            {
              columnId: "bytes",
              value: item.bytesRead?.toLocaleString() ?? "—",
            },
            { columnId: "status", value: item.error ?? item.status },
          ],
        })),
      };
    if (result.data?.status === "error")
      return {
        type: "error",
        message:
          result.data.diagnostics.find((item) => item.error)?.error ??
          "This query could not be run.",
      };
    if (audit) return audit.table;
    if (!prepared.data.length) {
      let description = "Try a wider time range or different filters.";
      if (prepared.availableSeries.length)
        description = onHiddenSeriesChange
          ? "Choose Displayed series to restore a result."
          : "Edit this widget to change its saved series selection.";
      else if (result.data?.rows.length)
        description =
          "Show a query or formula in the widget editor. The executed values remain available in Data.";
      return {
        type: "empty",
        message: result.data?.rows.length ? "No series displayed" : undefined,
        description,
      };
    }
    if (!prepared.hasMeasuredValues)
      return {
        type: "empty",
        message: "No measured value",
        description: "Try a wider time range or different filters.",
      };
    if (view === "chart" && prepared.hasIncompatibleUnits) {
      if (config.display.chartType === "NUMBER") return prepared.table;
      return prepared.pivotTable;
    }
    if (config.display.chartType === "PIVOT_TABLE" && view === "chart")
      return prepared.pivotTable;
    if (
      config.display.chartType === "PIVOT_TABLE" ||
      (config.display.chartType === "NUMBER" && prepared.summaries.length !== 1)
    )
      return prepared.table;
    if (config.display.chartType === "NUMBER") {
      const summary = prepared.summaries[0];
      return summary?.value === null || !summary
        ? { type: "empty", message: "No measured value" }
        : {
            type: "number",
            value: summary.value,
            valueFormatter: studioMetricFormatter(prepared.unit),
          };
    }
    return (
      chart.confirmation ??
      applyStudioSeriesPresentation(chart.visualization, prepared)
    );
  })();
  const headline = config.display.showHeadline ? prepared.headline : undefined;
  const headlineUnit = headline
    ? prepared.visibleSeries.find(
        (series) =>
          series.queryId === headline.queryId &&
          series.metricId === headline.metricId,
      )?.unit
    : undefined;
  const scoreDescriptions = describeStudioScores(effectiveConfig);
  const scoreTargets = [
    ...new Set(
      effectiveConfig.queries
        .filter(
          (query) =>
            query.view.startsWith("scores-") &&
            !query.hidden &&
            (!effectiveConfig.display.activeQueryIds ||
              effectiveConfig.display.activeQueryIds.includes(query.id)),
        )
        .map((query) => query.scoreTarget ?? "all"),
    ),
  ];
  const badge = (() => {
    if (result.data?.status === "partial")
      return {
        text: "Partial result",
        description:
          "Some queries failed. Inspect this widget to see which ones.",
      };
    if (result.data?.warnings.length)
      return {
        text: "Filter scope",
        description: result.data.warnings.join(". "),
      };
    if (
      prepared.hasIncompatibleUnits &&
      config.display.chartType !== "PIVOT_TABLE"
    )
      return {
        text: "Different units",
        description:
          "Shown as a table so each metric keeps its own unit. Use separate charts to compare different units.",
      };
    return undefined;
  })();
  const description = (() => {
    if (view === "chart") return config.description;
    if (view === "inspect" && config.executionMode === "current")
      return "The browser counts API requests and result rows. Server timing, rows read and bytes read are unavailable on this endpoint.";
    return undefined;
  })();
  return (
    <div className="ph-no-capture flex h-full min-h-0 flex-col">
      <Frame
        title={config.title}
        description={description}
        descriptionBehavior="expandable"
        descriptor={
          scoreDescriptions.length ? (
            <div className="ph-no-capture flex min-w-0 flex-col gap-1 text-xs">
              {scoreDescriptions.length === 1 ? (
                <span className="text-muted-foreground">
                  {scoreDescriptions[0]}
                </span>
              ) : (
                <details>
                  <summary className="text-muted-foreground cursor-pointer">
                    {scoreDescriptions.length} score queries · definition,
                    origin and measure
                  </summary>
                  <ul className="flex flex-col gap-1 pt-2">
                    {scoreDescriptions.map((description, index) => (
                      <li key={index}>{description}</li>
                    ))}
                  </ul>
                </details>
              )}
              <span className="text-muted-foreground">
                Individual score records · score timestamp
                {scoreTargets.every((target) => target === "all")
                  ? " · all attachments"
                  : ""}
              </span>
              {scoreTargets.some((target) => target !== "all") ? (
                <span className="flex flex-wrap items-center gap-1">
                  {scoreTargets
                    .filter((target) => target !== "all")
                    .map((target) => (
                      <ScoreTag key={target} level={target} />
                    ))}
                </span>
              ) : null}
            </div>
          ) : undefined
        }
        actions={actions}
        controls={[
          ...(queryView?.configuredQueryIds &&
          config.queries.filter((query) => !query.hidden).length > 1
            ? [
                {
                  id: "series-view",
                  label: "View",
                  type: "select" as const,
                  noCapture: true,
                  value: selectedQuery,
                  options: [
                    {
                      value: "configured",
                      label:
                        config.queries
                          .filter((query) =>
                            queryView.configuredQueryIds?.includes(query.id),
                          )
                          .map((query) => query.label)
                          .join(" + ") || "Overview",
                    },
                    ...config.queries
                      .filter((query) => !query.hidden)
                      .map((query) => ({
                        value: query.id,
                        label: query.label,
                      })),
                    { value: "all", label: "All series" },
                  ],
                  onValueChange: (value: string) => {
                    queryView?.onChange(value);
                    track("view_changed", {
                      target: "chart",
                      widgetKind: "query",
                      selectedCount:
                        value === "all" ? config.queries.length : 1,
                      scope: "widget",
                    });
                  },
                },
              ]
            : []),
          ...(onHiddenSeriesChange
            ? [
                {
                  id: "displayed-series",
                  label: "Displayed series",
                  type: "multiselect" as const,
                  noCapture: true,
                  value: prepared.visibleSeries.map((series) => series.id),
                  options: prepared.availableSeries.map((series) => ({
                    value: series.id,
                    label: series.label,
                  })),
                  placeholder: "No series displayed",
                  searchPlaceholder: "Find a series",
                  emptyMessage: "No executed series",
                  selectAllLabel: "All series",
                  onValueChange: (ids: string[]) => {
                    const selected = new Set(ids);
                    const available = new Set(
                      prepared.availableSeries.map((series) => series.id),
                    );
                    const hidden = [
                      ...new Set([
                        ...(config.display.hiddenSeriesIds ?? []).filter(
                          (id) => !available.has(id),
                        ),
                        ...prepared.availableSeries
                          .filter((series) => !selected.has(series.id))
                          .map((series) => series.id),
                      ]),
                    ];
                    if (hidden.length > 1000) {
                      setSelectionError(
                        "A saved selection can hide up to 1,000 series. Narrow the breakdown first.",
                      );
                      return;
                    }
                    setSelectionError(undefined);
                    onHiddenSeriesChange(hidden);
                  },
                },
              ]
            : []),
          ...(audit
            ? [
                ...(result.data?.summaries.length
                  ? [
                      {
                        id: "data-scope",
                        label: "Data scope",
                        type: "select" as const,
                        noCapture: true,
                        value: dataScope,
                        options: [
                          { value: "rows", label: "Query results" },
                          {
                            value: "summaries",
                            label: "Full-period summaries",
                          },
                        ],
                        onValueChange: (value: string) => {
                          setDataView((current) => ({
                            ...current,
                            scope: value === "summaries" ? "summaries" : "rows",
                            pageIndex: 0,
                          }));
                          track("view_changed", {
                            target: "table",
                            scope: "display",
                            widgetKind: "query",
                          });
                        },
                      },
                    ]
                  : []),
                {
                  id: "data-reference",
                  label: "Reference",
                  type: "select" as const,
                  noCapture: true,
                  value: audit.reference,
                  options: audit.referenceOptions,
                  onValueChange: (reference: string) => {
                    setDataView((current) => ({
                      ...current,
                      reference,
                      pageIndex: 0,
                    }));
                    track("view_changed", {
                      target: "table",
                      scope: "display",
                      widgetKind: "query",
                      selectedCount:
                        reference === "all"
                          ? audit.referenceOptions.length - 1
                          : 1,
                    });
                  },
                },
              ]
            : []),
        ]}
        badge={badge}
        tabs={{
          value: view,
          options: [
            {
              value: "chart",
              label: prepared.hasIncompatibleUnits ? "Table" : "Chart",
            },
            { value: "table", label: "Data" },
            { value: "inspect", label: "Inspect" },
          ],
          onValueChange: (value) => {
            setView(value);
            track(value === "inspect" ? "query_inspected" : "view_changed", {
              target: (
                {
                  inspect: "diagnostics",
                  table: "table",
                  chart: "chart",
                } as const
              )[value as "inspect" | "table" | "chart"],
              widgetKind: "query",
              scope: "display",
            });
          },
        }}
        content={content}
        metric={
          view === "chart" && headline && config.display.chartType !== "NUMBER"
            ? {
                value: formatStudioValue(
                  headline.value,
                  prepared.hasIncompatibleUnits ? headlineUnit : prepared.unit,
                ),
                description: config.display.headlineMetricRef
                  ? `${headline.label} · Across the full time range`
                  : "Across the full time range",
              }
            : undefined
        }
      />
      {audit && audit.rowCount > 0 ? (
        <PaginationBar
          mode="offset"
          totalCount={audit.rowCount}
          state={{ pageIndex: audit.pageIndex, pageSize: audit.pageSize }}
          pageSizeOptions={[25, 50, 100]}
          onChange={(page) => {
            setDataView((current) => ({ ...current, ...page }));
            track("view_changed", {
              target: "table",
              scope: "display",
              widgetKind: "query",
              selectedCount: page.pageSize,
            });
          }}
        />
      ) : null}
      {prepared.headlineSuppressed && view === "chart" ? (
        <p
          role="status"
          className="text-muted-foreground shrink-0 border-x border-b px-3 py-2 text-xs"
        >
          The full-period headline is hidden because only part of its result is
          displayed. Data still shows the full query summary.
        </p>
      ) : null}
      {audit ? (
        <details
          className="ph-no-capture bg-muted text-muted-foreground relative shrink-0 border-x border-b text-xs"
          onToggle={(event) => {
            if (event.currentTarget.open)
              track("query_inspected", {
                target: "table",
                widgetKind: "query",
                scope: "display",
              });
          }}
        >
          <summary className="flex cursor-pointer items-center gap-3 px-3 py-1.5">
            <span className="shrink-0">Data details</span>
            {config.expressions.length === 1 ? (
              <code
                className="min-w-0 truncate"
                title={`${config.expressions[0]!.id} = ${config.expressions[0]!.formula}`}
              >
                {config.expressions[0]!.id} = {config.expressions[0]!.formula}
              </code>
            ) : null}
          </summary>
          <div className="bg-background absolute right-0 bottom-full left-0 z-20 flex max-h-40 flex-col gap-2 overflow-auto rounded-t border p-3 shadow-lg">
            {config.expressions.length ? (
              <div aria-label="Formula definitions">
                {config.expressions.map((expression) => (
                  <p key={expression.id} className="font-mono break-all">
                    {expression.id} = {expression.formula}
                  </p>
                ))}
              </div>
            ) : null}
            <p>
              {dataScope === "summaries"
                ? "Full-period summaries cover all query results, including series hidden from the chart. "
                : "Exact executed aggregates, including hidden inputs and any query top-N limit. "}
              Missing count buckets use 0 in formulas; other missing inputs and
              division by zero produce null.
            </p>
          </div>
        </details>
      ) : null}
      {onHiddenSeriesChange && view === "chart" ? (
        <p className="text-muted-foreground shrink-0 px-3 py-1 text-xs">
          Displayed series is saved with this widget. Legend clicks are
          temporary.
        </p>
      ) : null}
      {view === "chart" && displayedScore && (
        <p className="text-muted-foreground shrink-0 border-t px-3 py-1.5 text-xs">
          {focusedScore ? "Selected bucket" : "Latest bucket"} ·{" "}
          {displayedScore.time} ·{" "}
          {formatStudioValue(displayedScore.value, config.display.unit)} from{" "}
          {displayedScore.evaluationCount?.toLocaleString()} evaluations
        </p>
      )}
      {selectionError ? (
        <p role="alert" className="text-destructive shrink-0 px-3 py-1 text-xs">
          {selectionError}
        </p>
      ) : null}
      {view === "chart" &&
      prepared.hasIncompatibleUnits &&
      config.display.chartType !== "PIVOT_TABLE" ? (
        <p
          role="status"
          className="bg-muted text-muted-foreground shrink-0 rounded-b border px-3 py-2 text-xs"
        >
          These metrics use different units, so they are shown in a table.
          Choose a table or use separate charts.
        </p>
      ) : null}
      {view === "inspect" && result.data?.warnings.length ? (
        <p className="bg-muted text-muted-foreground rounded-b border px-3 py-2 text-xs">
          {result.data.warnings.join(". ")}
        </p>
      ) : null}
      {view === "inspect" &&
      result.data?.diagnostics.some((item) => item.compiledSql) ? (
        <details className="ph-no-capture bg-background shrink-0 rounded-b-lg border px-3 py-2 text-xs">
          <summary className="cursor-pointer font-bold">
            Generated queries
          </summary>
          <div className="flex max-h-56 flex-col gap-3 overflow-auto pt-3">
            {result.data.diagnostics
              .filter((item) => item.compiledSql)
              .map((item) => (
                <div key={item.queryId}>
                  <p className="text-muted-foreground mb-1 font-mono">
                    {item.queryId}
                  </p>
                  <pre className="bg-muted overflow-auto rounded p-3 text-[11px] leading-relaxed">
                    {item.compiledSql}
                  </pre>
                </div>
              ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
