import { useEffect, useId, useState } from "react";
import { hashKey } from "@tanstack/react-query";
import { type FilterState, type StudioWidgetConfig } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import {
  DataCard,
  type DataCardActions,
} from "@/src/components/design-system/DataCard/DataCard";
import { type Visualization } from "@/src/components/design-system/charts/internal/VisualizationFrame/VisualizationFrame";
import { usePreparedWidgetChart } from "@/src/features/widgets/components/usePreparedWidgetChart";
import {
  prepareStudioChart,
  studioMetricFormatter,
  formatStudioValue,
} from "./prepareStudioChart";
import { useDashboardQuerySlot } from "@/src/features/dashboard/hooks/DashboardQuerySchedulerProvider";
import { useDashboardStudioCapture } from "./analytics";
import { ScoreTag } from "@/src/components/ScoreTag";
import { resolveStudioQueryVersion } from "./studioConfig";

export type StudioQueryWidgetProps = {
  projectId: string;
  config: StudioWidgetConfig;
  readPath: ResolvedReadPath;
  dateRange: { from: Date; to: Date } | undefined;
  filterState: FilterState;
  actions?: DataCardActions;
};

export function StudioQueryWidget({
  projectId,
  config,
  readPath,
  dateRange,
  filterState,
  actions,
}: StudioQueryWidgetProps) {
  const [view, setView] = useState("chart");
  const [selectedQuery, setSelectedQuery] = useState("configured");
  const queryId = useId();
  const queryVersion = resolveStudioQueryVersion(
    config,
    readPath === "v4" ? "v2" : "v1",
    filterState,
  );
  const track = useDashboardStudioCapture(queryVersion === "v2");
  const [fallbackRange] = useState(() => ({
    from: new Date(Date.now() - 7 * 86400000),
    to: new Date(),
  }));
  const range = dateRange ?? fallbackRange;
  const effectiveConfig =
    selectedQuery === "configured"
      ? config
      : {
          ...config,
          display: {
            ...config.display,
            activeQueryIds:
              selectedQuery === "all" ? undefined : [selectedQuery],
          },
        };
  const input = {
    projectId,
    config:
      effectiveConfig.display.chartType === "NUMBER"
        ? {
            ...effectiveConfig,
            display: { ...effectiveConfig.display, showHeadline: true },
          }
        : effectiveConfig,
    version: queryVersion,
    fromTimestamp: range.from.toISOString(),
    toTimestamp: range.to.toISOString(),
    granularity: "auto" as const,
    filters: filterState,
  };
  const slot = useDashboardQuerySlot({
    queryId,
    runKey: hashKey([input]),
    enabled: true,
  });
  const result = api.dashboardStudio.execute.useQuery(input, {
    enabled: slot.canFetch,
    refetchOnWindowFocus: false,
    retry: false,
    trpc: { abortOnUnmount: true },
  });
  // A completed network request releases its external scheduler slot.
  useEffect(() => {
    if (slot.canFetch && result.fetchStatus === "idle" && !result.isPending)
      slot.markDone();
  }, [result.fetchStatus, result.isPending, slot]);
  const prepared = prepareStudioChart(result.data, effectiveConfig);
  const chart = usePreparedWidgetChart({
    chartType: config.display.chartType,
    active: true,
    data: prepared.data,
    config: prepared.colors,
    rowLimit: config.display.rowLimit ?? 100,
    metricFormatter: studioMetricFormatter(prepared.unit),
    legendPosition: config.display.legend === false ? "none" : "below",
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
          { id: "queries", label: "Database queries", align: "right" },
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
              value: `${Math.round(item.durationMs)} ms`,
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
    if (!prepared.data.length)
      return {
        type: "empty",
        description: "Try a wider time range or different filters.",
      };
    if (view === "chart" && prepared.hasIncompatibleUnits) {
      if (config.display.chartType === "NUMBER") return prepared.table;
      return prepared.pivotTable;
    }
    if (config.display.chartType === "PIVOT_TABLE" && view === "chart")
      return prepared.pivotTable;
    if (
      view === "table" ||
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
    return chart.confirmation ?? chart.visualization;
  })();
  const headline = (() => {
    if (!config.display.showHeadline) return undefined;
    if (config.display.headlineMetricRef)
      return prepared.summaries.find(
        (row) =>
          `${row.queryId}.${row.metricId}` === config.display.headlineMetricRef,
      );
    if (prepared.summaries.length === 1 && !prepared.hasIncompatibleUnits)
      return prepared.summaries[0];
    return undefined;
  })();
  const headlineUnit = headline
    ? prepared.visibleSeries.find(
        (series) =>
          series.queryId === headline.queryId &&
          series.metricId === headline.metricId,
      )?.unit
    : undefined;
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
  return (
    <div className="ph-no-capture flex h-full min-h-0 flex-col">
      <DataCard
        title={config.title}
        description={config.description}
        descriptor={
          scoreTargets.length ? (
            <>
              <span className="text-muted-foreground text-xs">
                Score targets:
              </span>
              {scoreTargets.map((target) =>
                target === "all" ? (
                  <span key={target} className="text-muted-foreground text-xs">
                    All score targets
                  </span>
                ) : (
                  <ScoreTag key={target} level={target} />
                ),
              )}
            </>
          ) : undefined
        }
        actions={actions}
        controls={
          config.display.activeQueryIds &&
          config.queries.filter((query) => !query.hidden).length > 1
            ? [
                {
                  id: "series-view",
                  label: "View",
                  type: "select",
                  noCapture: true,
                  value: selectedQuery,
                  options: [
                    {
                      value: "configured",
                      label:
                        config.queries
                          .filter((query) =>
                            config.display.activeQueryIds?.includes(query.id),
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
                  onValueChange: (value) => {
                    setSelectedQuery(value);
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
            : []
        }
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
          headline && config.display.chartType !== "NUMBER"
            ? {
                value: formatStudioValue(
                  headline.value,
                  prepared.hasIncompatibleUnits ? headlineUnit : prepared.unit,
                ),
                description: "Across the full time range",
              }
            : undefined
        }
      />
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
