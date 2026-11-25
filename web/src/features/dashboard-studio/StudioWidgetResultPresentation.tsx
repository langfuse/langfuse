import { useState, type ComponentProps, type ComponentType } from "react";
import { type StudioWidgetConfig } from "@langfuse/shared";
import { type DataCard } from "@/src/components/design-system/DataCard/DataCard";
import { type Visualization } from "@/src/components/design-system/charts/internal/VisualizationFrame/VisualizationFrame";
import { usePreparedWidgetChart } from "@/src/features/widgets/components/usePreparedWidgetChart";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { ScoreTag } from "@/src/components/ScoreTag";
import {
  applyStudioSeriesPresentation,
  formatStudioValue,
  type prepareStudioChart,
  studioMetricFormatter,
} from "./prepareStudioChart";
import { useDashboardStudioCapture } from "./analytics";
import { describeStudioScores } from "./studioScoreDescription";
import { type useStudioWidgetResult } from "./useStudioWidgetResult";
import { SeriesLegend } from "./SeriesLegend";

export type StudioWidgetResultFrameProps = ComponentProps<typeof DataCard>;
export type StudioWidgetCardResultProps = {
  config: StudioWidgetConfig;
  runtime: ReturnType<typeof useStudioWidgetResult>;
  prepared: ReturnType<typeof prepareStudioChart>;
  title?: string;
  tabs?: StudioWidgetResultFrameProps["tabs"];
  actions?: StudioWidgetResultFrameProps["actions"];
  onHiddenSeriesChange?: (ids: string[]) => void;
};

export function StudioWidgetResultPresentation({
  config,
  runtime,
  prepared: initial,
  Frame,
  actions,
  tabs,
  title,
  onHiddenSeriesChange,
}: StudioWidgetCardResultProps & {
  Frame: ComponentType<StudioWidgetResultFrameProps>;
}) {
  const [focusedBucket, setFocusedBucket] = useState<string>();
  const isMobile = useIsMobile();
  const track = useDashboardStudioCapture(runtime.version === "v2");
  const result = runtime.result;
  const hidden = new Set(config.display.hiddenSeriesIds);
  const prepared = initial;
  const scoreBuckets =
    config.display.chartType === "LINE_TIME_SERIES" &&
    prepared.visibleSeries.length === 1
      ? (result.data?.rows.filter(
          (row) =>
            row.seriesId === prepared.visibleSeries[0]!.id &&
            row.time &&
            row.evaluationCount !== undefined,
        ) ?? [])
      : [];
  const score =
    scoreBuckets.find(
      (row) =>
        row.time === focusedBucket ||
        String(Date.parse(row.time!)) === focusedBucket,
    ) ??
    scoreBuckets.reduce<(typeof scoreBuckets)[number] | undefined>(
      (a, b) => (!a || b.time! > a.time! ? b : a),
      undefined,
    );
  const chart = usePreparedWidgetChart({
    sync: scoreBuckets.length
      ? { activeKey: focusedBucket, onActiveKeyChange: setFocusedBucket }
      : undefined,
    chartType: config.display.chartType,
    active: !prepared.hasIncompatibleUnits,
    data: prepared.data,
    config: prepared.colors,
    rowLimit: config.display.rowLimit ?? 100,
    metricFormatter: studioMetricFormatter(prepared.unit, 4),
    legendPosition: "none",
    zeroBaseline: true,
    colorBarsByCategory: true,
    missingValue: "gap",
  });
  const content = ((): Visualization => {
    if (result.isPending)
      return { type: "loading", progress: { type: "spinner" } };
    if (result.error || result.data?.status === "error")
      return {
        type: "error",
        message:
          result.error?.message ??
          result.data?.diagnostics.find((d) => d.error)?.error ??
          "This chart could not run.",
        onRetry: () => {
          result.refetch();
        },
      };
    if (!prepared.data.length)
      return {
        type: "empty",
        message: prepared.availableSeries.length
          ? "No series displayed"
          : "No data",
        description: prepared.availableSeries.length
          ? "Click a legend item to show it."
          : "Try a wider time range or different filters.",
      };
    if (prepared.chartRequirement) return prepared.chartRequirement;
    if (!prepared.hasMeasuredValues)
      return {
        type: "empty",
        message: "No measured value",
        description: "Try a wider time range or different filters.",
      };
    if (config.display.chartType === "PIVOT_TABLE") return prepared.pivotTable;
    if (prepared.hasIncompatibleUnits)
      return {
        type: "empty",
        message: "These series use different units",
        description:
          "Move a series to another tab in the editor, or choose a table.",
      };
    if (config.display.chartType === "NUMBER") {
      const summary = prepared.summaries[0];
      return summary?.value == null
        ? { type: "empty", message: "No measured value" }
        : {
            type: "number",
            value: summary.value,
            valueFormatter: studioMetricFormatter(prepared.unit),
          };
    }
    const chartResult =
      chart.confirmation ??
      applyStudioSeriesPresentation(
        chart.visualization,
        prepared,
        undefined,
        isMobile,
      );
    if (
      chartResult.type === "line" ||
      chartResult.type === "area" ||
      chartResult.type === "stacked-bar" ||
      chartResult.type === "grouped-bar"
    )
      return { ...chartResult, legend: { visibility: "hidden" } };
    if (chartResult.type === "bar")
      return { ...chartResult, legend: undefined };
    return chartResult;
  })();
  const descriptions = describeStudioScores(config);
  const targets = [
    ...new Set(
      config.queries
        .filter((q) => !q.hidden && q.view.startsWith("scores-"))
        .map((q) => q.scoreTarget ?? "all"),
    ),
  ];
  const headline =
    config.display.showHeadline && config.display.chartType !== "NUMBER"
      ? prepared.headline
      : undefined;
  const warning =
    result.data?.status === "partial"
      ? result.data.diagnostics
          .filter((item) => item.error)
          .map((item) => item.error)
          .join(". ")
      : result.data?.warnings.join(". ");
  return (
    <div className="group/widget ph-no-capture flex h-full min-h-0 flex-col">
      <Frame
        title={title ?? config.title}
        description={config.description}
        descriptionBehavior="expandable"
        descriptor={
          descriptions.length ? (
            <div className="text-muted-foreground flex flex-col gap-1 text-xs">
              {descriptions.length === 1 ? (
                descriptions[0]
              ) : (
                <details>
                  <summary className="cursor-pointer">
                    {descriptions.length} score queries
                  </summary>
                  <ul>
                    {descriptions.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </details>
              )}
              <span>
                Individual score records · score timestamp
                {targets.every((t) => t === "all") ? " · all attachments" : ""}
              </span>
              {targets
                .filter((t) => t !== "all")
                .map((t) => (
                  <ScoreTag key={t} level={t} />
                ))}
            </div>
          ) : undefined
        }
        badge={
          warning
            ? {
                text:
                  result.data?.status === "partial"
                    ? "Partial result"
                    : "Filter scope",
                description: warning,
              }
            : undefined
        }
        actions={actions}
        tabs={tabs}
        content={content}
        metric={
          headline
            ? {
                value: formatStudioValue(
                  headline.value,
                  prepared.visibleSeries.find(
                    (s) =>
                      s.queryId === headline.queryId &&
                      s.metricId === headline.metricId,
                  )?.unit ?? prepared.unit,
                ),
                description: "Across the full time range",
              }
            : undefined
        }
      />
      {config.display.legend !== false &&
        initial.legendSeries.length > 0 &&
        !["PIVOT_TABLE", "NUMBER"].includes(config.display.chartType) && (
          <div className="shrink-0 px-2 py-1">
            <SeriesLegend
              series={initial.legendSeries}
              hidden={hidden}
              onToggle={(id) => {
                const hide = !hidden.has(id);
                if (onHiddenSeriesChange) {
                  const next = new Set(hidden);
                  if (hide) next.add(id);
                  else next.delete(id);
                  onHiddenSeriesChange([...next]);
                }
                track("legend_interacted", {
                  scope: "display",
                  widgetKind: "query",
                  interaction: hide ? "hide" : "show",
                  selectedCount:
                    prepared.visibleSeries.length + (hide ? -1 : 1),
                });
              }}
            />
          </div>
        )}
      {content.type === "number" && prepared.visibleSeries.length === 1 && (
        <p className="text-muted-foreground px-3 pb-2 text-center text-xs">
          {prepared.visibleSeries[0]!.label}
        </p>
      )}
      {score && (
        <p className="text-muted-foreground px-3 py-1 text-xs">
          {score.time} · {formatStudioValue(score.value, config.display.unit)}{" "}
          from {score.evaluationCount?.toLocaleString()} evaluations
        </p>
      )}
    </div>
  );
}
