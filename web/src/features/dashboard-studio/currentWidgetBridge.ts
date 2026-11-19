import { type StudioWidgetConfig } from "@langfuse/shared";
import {
  type WidgetInitialValues,
  type WidgetSavePayload,
} from "@/src/features/widgets/components/widgetFormSchema";
import { withStudioQueries } from "./studioConfig";

export function currentWidgetSaveConstraintReason(
  initial: StudioWidgetConfig,
  payload: WidgetSavePayload,
): string | null {
  const query = initial.queries[0];
  if (!query?.view.startsWith("scores-")) return null;
  const canonicalColumn = (column: string) =>
    ({ scoreName: "name", scoreSource: "source" })[column] ?? column;
  const signature = (filter: (typeof query.filters)[number]) => {
    const values = Array.isArray(filter.value)
      ? filter.value.map(String).sort()
      : [String(filter.value)];
    const operator =
      filter.operator === "any of" && values.length === 1
        ? "="
        : filter.operator;
    return JSON.stringify([canonicalColumn(filter.column), operator, values]);
  };
  const required = query.filters.filter((filter) =>
    ["source", "dataType", "configId"].includes(canonicalColumn(filter.column)),
  );
  if (
    required.some(
      (filter) =>
        !payload.filters.some(
          (candidate) => signature(candidate) === signature(filter),
        ),
    )
  )
    return "The current editor did not retain the selected score origin, type or definition. Use the multi-query editor to save this question without changing its population.";
  return null;
}

export function currentWidgetRepresentationReason(
  config: StudioWidgetConfig,
): string | null {
  if (config.queries.length !== 1)
    return "The current editor supports one query per chart. This question needs independent queries; use the multi-query editor.";
  if (config.expressions.length)
    return "Calculated metrics are not available in the current editor. Your formula draft is preserved in the other builders.";
  const query = config.queries[0]!;
  if (query.hidden || config.display.hiddenSeriesIds?.length)
    return "This chart has saved series visibility that the current editor cannot edit.";
  if (query.scoreTarget && query.scoreTarget !== "all")
    return "The current editor cannot select this score attachment scope.";
  if (
    query.metrics.some(
      (metric) =>
        metric.percentile !== undefined ||
        metric.summary ||
        metric.measure === "activeDays",
    ) ||
    config.display.histogramEdges?.length
  )
    return "This question uses an experimental metric option. Use the future builder to retain its meaning.";
  const pivot = config.display.chartType === "PIVOT_TABLE";
  if (
    (!pivot && query.metrics.length > 1) ||
    query.dimensions.length > (pivot ? 2 : 1)
  )
    return "The current editor only combines multiple metrics in a table. Use the multi-query editor for this chart.";
  if (
    (config.display.timeSeries ??
      config.display.chartType.endsWith("TIME_SERIES")) !==
    config.display.chartType.endsWith("TIME_SERIES")
  )
    return "This chart separates time grouping from its visualization. The current editor cannot express that choice.";
  return null;
}

export function toCurrentWidgetInitialValues(
  config: StudioWidgetConfig,
): WidgetInitialValues {
  const query = config.queries[0]!;
  const metric = query.metrics[0]!;
  return {
    name: config.title,
    description: config.description,
    view: query.view,
    measure: metric.measure,
    aggregation: metric.aggregation,
    dimension: query.dimensions[0]?.field ?? "none",
    dimensions: query.dimensions,
    metrics: query.metrics.map((item) => ({
      measure: item.measure,
      agg: item.aggregation,
    })),
    filters: query.filters,
    chartType: config.display.chartType,
    chartConfig: {
      type: config.display.chartType,
      bins: config.display.bins,
      row_limit: config.display.rowLimit,
      ...(config.display.chartType === "PIVOT_TABLE" && query.orderBy?.[0]
        ? {
            defaultSort: {
              column: query.orderBy[0].field,
              order: query.orderBy[0].direction === "asc" ? "ASC" : "DESC",
            },
          }
        : {}),
    },
  };
}

export function fromCurrentWidgetPayload(
  initial: StudioWidgetConfig,
  payload: WidgetSavePayload,
): StudioWidgetConfig {
  const previous = initial.queries[0]!;
  const query = {
    ...previous,
    view: payload.view as typeof previous.view,
    label: payload.name,
    dimensions: payload.dimensions,
    filters: payload.filters,
    metrics: payload.metrics.map((metric, index) => ({
      id:
        previous.metrics.find(
          (item) =>
            item.measure === metric.measure && item.aggregation === metric.agg,
        )?.id ?? `metric_${index + 1}`,
      measure: metric.measure,
      aggregation:
        metric.agg as (typeof previous.metrics)[number]["aggregation"],
    })),
    orderBy: payload.chartConfig.defaultSort
      ? [
          {
            field: payload.chartConfig.defaultSort.column,
            direction:
              payload.chartConfig.defaultSort.order === "ASC"
                ? ("asc" as const)
                : ("desc" as const),
          },
        ]
      : undefined,
  };
  return withStudioQueries(
    {
      ...initial,
      executionMode: "current",
      title: payload.name,
      description: payload.description,
      expressions: [],
      display: {
        ...initial.display,
        chartType: payload.chartType,
        timeSeries: payload.chartType.endsWith("TIME_SERIES"),
        bins: payload.chartConfig.bins,
        rowLimit: payload.chartConfig.row_limit,
      },
    },
    [query],
  );
}
