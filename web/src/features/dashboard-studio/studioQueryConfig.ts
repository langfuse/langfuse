import { hashKey } from "@tanstack/react-query";
import { type StudioWidgetConfig } from "@langfuse/shared";

type ChartType = StudioWidgetConfig["display"]["chartType"];

function queryChartType(type: ChartType): ChartType {
  if (
    ["LINE_TIME_SERIES", "AREA_TIME_SERIES", "BAR_TIME_SERIES"].includes(type)
  )
    return "LINE_TIME_SERIES";
  if (["VERTICAL_BAR", "HORIZONTAL_BAR", "PIE"].includes(type))
    return "VERTICAL_BAR";
  return type;
}

function hasTimeBuckets(config: StudioWidgetConfig) {
  return (
    config.display.timeSeries ??
    config.display.chartType.endsWith("TIME_SERIES")
  );
}

/** The actual request and cache key share this projection; presentation cannot rerun SQL. */
export function toStudioQueryConfig(
  config: StudioWidgetConfig,
): StudioWidgetConfig {
  return {
    version: config.version,
    title: "Widget",
    description: "",
    queries: config.queries.map((query) => ({
      id: query.id,
      label: query.id,
      view: query.view,
      metrics: query.metrics.map((metric) => ({
        id: metric.id,
        measure: metric.measure,
        aggregation: metric.aggregation,
        percentile: metric.percentile,
        summary: metric.summary,
      })),
      dimensions: query.dimensions,
      filters: query.filters,
      scoreTarget: query.scoreTarget,
      orderBy: query.orderBy,
    })),
    expressions: config.expressions.map((expression) => ({
      id: expression.id,
      label: expression.id,
      formula: expression.formula,
    })),
    display: {
      chartType: queryChartType(config.display.chartType),
      timeSeries: hasTimeBuckets(config),
      showHeadline:
        config.display.chartType === "NUMBER" ||
        config.display.showHeadline === true,
      rowLimit: config.display.rowLimit,
      bins: config.display.bins,
      histogramEdges: config.display.histogramEdges,
      activeQueryIds: config.display.activeQueryIds,
    },
  };
}

export function hasStudioQueryChanges(
  draft: StudioWidgetConfig,
  lastRun: StudioWidgetConfig,
) {
  return (
    hashKey([toStudioQueryConfig(draft)]) !==
    hashKey([toStudioQueryConfig(lastRun)])
  );
}

/** Keep unrun data definitions frozen while applying current presentation intent. */
export function getStudioRenderConfig(
  lastRun: StudioWidgetConfig,
  draft: StudioWidgetConfig,
): StudioWidgetConfig {
  const sameChartShape =
    queryChartType(lastRun.display.chartType) ===
      queryChartType(draft.display.chartType) &&
    hasTimeBuckets(lastRun) === hasTimeBuckets(draft);
  const refs = new Set(
    lastRun.queries.flatMap((query) =>
      query.metrics.map((metric) => `${query.id}.${metric.id}`),
    ),
  );
  let headlineMetricRef = draft.display.headlineMetricRef;
  if (headlineMetricRef && !refs.has(headlineMetricRef))
    headlineMetricRef = lastRun.display.headlineMetricRef;
  return {
    ...lastRun,
    title: draft.title,
    description: draft.description,
    queries: lastRun.queries.map((query) => {
      const current = draft.queries.find((item) => item.id === query.id);
      if (!current) return query;
      return {
        ...query,
        label: current.label,
        hidden: current.hidden,
        metrics: query.metrics.map((metric) => {
          const draftMetric = current.metrics.find(
            (item) => item.id === metric.id,
          );
          return draftMetric ? { ...metric, label: draftMetric.label } : metric;
        }),
      };
    }),
    expressions: lastRun.expressions.map((expression) => {
      const current = draft.expressions.find(
        (item) => item.id === expression.id,
      );
      return current
        ? {
            ...expression,
            label: current.label,
            unit: current.unit,
            hidden: current.hidden,
          }
        : expression;
    }),
    display: {
      ...lastRun.display,
      chartType: sameChartShape
        ? draft.display.chartType
        : lastRun.display.chartType,
      unit: draft.display.unit,
      legend: draft.display.legend,
      showHeadline:
        draft.display.showHeadline === false
          ? false
          : lastRun.display.showHeadline,
      hiddenSeriesIds: draft.display.hiddenSeriesIds,
      headlineMetricRef,
    },
  };
}
