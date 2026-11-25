import { type FilterState } from "@langfuse/shared";
import { homeCategoryQuery } from "./homeCategoryQuery";
import { homeScoreAggregate } from "./homeScoreAggregate";
import {
  multiQueryConfigSchema,
  type MultiQueryConfig,
} from "@langfuse/shared/dashboards";
import {
  getResultUnit,
  getViewDeclaration,
  resolveWidgetRenderVersion,
  validateQuery,
  type QueryType,
  type ViewVersion,
} from "@langfuse/shared/query";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { mergeWidgetAndDashboardFilters } from "@/src/features/widgets/utils";
import { isTimeSeriesChart } from "@/src/features/widgets/chart-library/utils";
import {
  seriesColor,
  seriesFillColor,
} from "@/src/features/widgets/chart-library/seriesColors";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import {
  dashboardDateRangeAggregationSettings,
  findClosestDashboardInterval,
} from "@/src/utils/date-range-utils";

export type MultiQuerySource = MultiQueryConfig["queries"][number];
export type MultiQueryContext = {
  dateRange: { from: Date; to: Date };
  filterState: FilterState;
  readPath: ResolvedReadPath;
};
export type PlannedMultiQuery = {
  source: MultiQuerySource;
  query: QueryType;
  version: ViewVersion;
  dimensions: string[];
  homeCategory?: ReturnType<typeof homeCategoryQuery>;
  homeScoreFilters?: ReturnType<typeof homeScoreAggregate>;
};
export type MultiQueryPlan = {
  queries: PlannedMultiQuery[];
  warnings: string[];
};
export type MultiQueryResult = {
  data: Record<string, unknown>[] | undefined;
  isPending: boolean;
  isError: boolean;
  error: string | null;
};
export type MultiQueryValue = {
  seriesId: string;
  queryId: string;
  metricId: string;
  queryLabel: string;
  metricLabel: string;
  time: string | null;
  dimensions: Record<string, string | null>;
  value: number | null;
  unit: string | undefined;
  evaluationCount?: number;
  bin?: string;
};
export type MultiQuerySeries = {
  id: string;
  label: string;
  unit: string | undefined;
  bucketUnit?: string;
  aggregation: string;
  color: string;
  fillColor: string;
};

export const readableMultiQueryField = (field: string) => {
  if (field === "providedModelName") return "Model";
  const words = field.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};
export function multiQueryMetricLabel(
  metric: MultiQuerySource["metrics"][number],
) {
  if (metric.label) return metric.label;
  if (metric.measure === "count" && metric.aggregation === "count")
    return "Count";
  const aggregation = metric.aggregation.startsWith("p")
    ? metric.aggregation
    : readableMultiQueryField(metric.aggregation);
  return `${aggregation} ${readableMultiQueryField(metric.measure).toLowerCase()}`;
}

export function createMultiQueryConfig(): MultiQueryConfig {
  return {
    version: 1,
    title: "New chart",
    description: "",
    queries: [
      {
        id: "a",
        label: "Observations",
        view: "observations",
        metrics: [{ id: "count", measure: "count", aggregation: "count" }],
        dimensions: [],
        filters: [],
      },
    ],
    display: {
      chartType: "VERTICAL_BAR",
      rowLimit: 100,
      bins: 10,
      legend: true,
    },
  };
}

/** Rendering choices with the same query grain reuse the production query cache. */
function queryChartType(type: MultiQueryConfig["display"]["chartType"]) {
  if (isTimeSeriesChart(type)) return "LINE_TIME_SERIES";
  if (type === "HORIZONTAL_BAR") return "VERTICAL_BAR";
  return type;
}

export function resolveMultiQueryView(
  config: MultiQueryConfig,
  selectedId: string | undefined,
) {
  const selected =
    selectedId === "all"
      ? undefined
      : (config.views?.find((view) => view.id === selectedId) ??
        config.views?.find((view) => view.id === config.defaultViewId));
  return {
    viewId: selected?.id ?? "all",
    queryIds: selected?.queryIds ?? config.queries.map((query) => query.id),
  };
}

export function buildMultiQueryPlan(
  config: MultiQueryConfig,
  context: MultiQueryContext,
  selectedQueryIds?: readonly string[],
): MultiQueryPlan {
  const parsed = multiQueryConfigSchema.safeParse({
    ...config,
    title: config.title || "Preview",
    queries: config.queries.map((source) => ({
      ...source,
      label: source.label || "Series",
    })),
  });
  if (!parsed.success)
    throw new Error(
      parsed.error.issues[0]?.message ?? "Invalid chart configuration",
    );
  if (!(context.dateRange.from < context.dateRange.to))
    throw new Error("Choose a valid time range");
  const warnings: string[] = [];
  const queries = config.queries
    .filter(
      (source) => !selectedQueryIds || selectedQueryIds.includes(source.id),
    )
    .map((source): PlannedMultiQuery => {
      const readVersion = context.readPath === "v4" ? "v2" : "v1";
      const version = source.homeScoreAggregate
        ? readVersion
        : resolveWidgetRenderVersion({
            newestReadableVersion: readVersion,
            shape: {
              view: source.view,
              measures: source.metrics,
              dimensions: source.dimensions,
              filters: [...source.filters, ...context.filterState],
            },
          });
      const declaration = getViewDeclaration(source.view, version);
      const localFilters = mapLegacyUiTableFilterToView(
        source.view,
        source.filters,
      );
      if (localFilters.length !== source.filters.length)
        throw new Error(
          `${source.label}: remove filters that are not supported by this data source`,
        );
      const mappedGlobal = mapLegacyUiTableFilterToView(
        source.view,
        context.filterState,
      );
      if (
        source.homeScoreAggregate &&
        mappedGlobal.length !== context.filterState.length
      ) {
        throw new Error(
          `${source.label}: a dashboard filter is unavailable for Home score records`,
        );
      }
      if (mappedGlobal.length !== context.filterState.length)
        warnings.push(
          `${source.label}: some dashboard filters do not apply to this data source`,
        );
      if (
        localFilters.some((filter) => filter.column === "environment") &&
        mappedGlobal.some((filter) => filter.column === "environment")
      )
        warnings.push(
          `${source.label}: its environment filter overrides the dashboard environment`,
        );
      const dimensions = [
        ...new Set([
          ...source.dimensions.map((dimension) => dimension.field),
          ...source.metrics.flatMap(
            (metric) =>
              declaration.measures[metric.measure]?.requiresDimension ?? [],
          ),
        ]),
      ];
      const metrics = source.metrics.map(({ measure, aggregation }) => ({
        measure,
        aggregation,
      }));
      const timeSeries = isTimeSeriesChart(config.display.chartType);
      const needsBucketCount =
        (timeSeries &&
          dimensions.length > 0 &&
          !(
            source.homeCategoryFallback &&
            metrics.some((metric) =>
              ["usageByType", "costByType"].includes(metric.measure),
            )
          )) ||
        metrics.some(
          (metric) =>
            !["count", "sum", "uniq", "histogram"].includes(metric.aggregation),
        );
      if (
        needsBucketCount &&
        !metrics.some(
          (metric) =>
            metric.measure === "count" && metric.aggregation === "count",
        )
      )
        metrics.push({ measure: "count", aggregation: "count" });
      const query: QueryType = {
        view: source.view,
        metrics,
        dimensions: dimensions.map((field) => ({ field })),
        filters: mergeWidgetAndDashboardFilters({
          view: source.view,
          widgetFilters: source.filters,
          dashboardFilters: context.filterState,
        }),
        timeDimension: timeSeries
          ? {
              granularity:
                config.display.timeBuckets === "dashboard"
                  ? (dashboardDateRangeAggregationSettings[
                      findClosestDashboardInterval(context.dateRange) ??
                        "last7Days"
                    ].dateTrunc ?? "day")
                  : "auto",
            }
          : null,
        fromTimestamp: context.dateRange.from.toISOString(),
        toTimestamp: context.dateRange.to.toISOString(),
        orderBy:
          source.orderBy ??
          (!timeSeries &&
          !metrics.some((metric) => metric.aggregation === "histogram")
            ? [
                {
                  field: `${metrics[0]!.aggregation}_${declaration.measures[metrics[0]!.measure]?.alias ?? metrics[0]!.measure}`,
                  direction: "desc",
                },
              ]
            : null),
        chartConfig: {
          type: queryChartType(config.display.chartType),
          bins: config.display.bins ?? 10,
          ...(!timeSeries ? { row_limit: config.display.rowLimit ?? 100 } : {}),
        },
      };
      const validation = validateQuery(query, version);
      if (!validation.valid)
        throw new Error(`${source.label}: ${validation.reason}`);
      const homeCategory =
        context.readPath === "v3" && source.homeCategoryFallback
          ? homeCategoryQuery(query)
          : undefined;
      const homeScoreFilters = source.homeScoreAggregate
        ? homeScoreAggregate(query)
        : undefined;
      return {
        source,
        query,
        version: homeCategory ? "v1" : version,
        dimensions,
        homeCategory,
        homeScoreFilters,
      };
    });
  return { queries, warnings };
}

const finite = (value: unknown): number | null =>
  value === null ||
  value === undefined ||
  value === "" ||
  !Number.isFinite(Number(value))
    ? null
    : Number(value);
const dimensionText = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
};

export function normalizeMultiQueryResults(
  plan: MultiQueryPlan,
  results: MultiQueryResult[],
) {
  const values: MultiQueryValue[] = [];
  const bucketTimes = new Set<string>();
  const descriptions = new Map<
    string,
    Omit<MultiQuerySeries, "color" | "fillColor">
  >();
  const failures: { id: string; label: string; message: string }[] = [];
  let pending = false;
  for (const [index, item] of plan.queries.entries()) {
    const result = results[index];
    if (!result || result.isPending) {
      pending = true;
      continue;
    }
    if (result.isError) {
      failures.push({
        id: item.source.id,
        label: item.source.label,
        message: result.error ?? "This series could not be loaded",
      });
      continue;
    }
    const resultVersion = item.homeCategory ? "v2" : item.version;
    const declaration = getViewDeclaration(item.source.view, resultVersion);
    for (const row of result.data ?? []) {
      const dimensions = Object.fromEntries(
        item.dimensions.map((field) => [
          field,
          dimensionText(row[declaration.dimensions[field]?.alias ?? field]),
        ]),
      );
      const dimensionLabel = Object.values(dimensions)
        .map((value) => value ?? "Unknown")
        .join(" · ");
      const time =
        typeof row.time_dimension === "string" ? row.time_dimension : null;
      if (time) bucketTimes.add(time);
      const count = finite(row.count_count);
      if (
        time &&
        item.dimensions.length > 0 &&
        Object.values(dimensions).every((value) => value === null) &&
        (count === 0 ||
          (item.source.homeCategoryFallback &&
            item.source.metrics.some((metric) =>
              ["costByType", "usageByType"].includes(metric.measure),
            )))
      )
        continue;
      for (const metric of item.source.metrics) {
        const metricLabel = multiQueryMetricLabel(metric);
        const id = `${item.source.id}.${metric.id}${item.dimensions.length > 0 ? `:${JSON.stringify(dimensions)}` : ""}`;
        const labels = [];
        if (!dimensionLabel || plan.queries.length > 1)
          labels.push(item.source.label);
        if (
          item.source.metrics.length > 1 ||
          (!dimensionLabel && metric.label && metricLabel !== item.source.label)
        )
          labels.push(metricLabel);
        if (dimensionLabel) labels.push(dimensionLabel);
        const label = labels.join(" · ");
        const bucketUnit = getResultUnit(
          item.source.view,
          metric.measure,
          metric.aggregation,
          resultVersion,
        );
        const unit =
          metric.aggregation === "histogram" ? "integer" : bucketUnit;
        descriptions.set(id, {
          id,
          label,
          unit,
          bucketUnit:
            metric.aggregation === "histogram" ? bucketUnit : undefined,
          aggregation: metric.aggregation,
        });
        const common = {
          seriesId: id,
          queryId: item.source.id,
          metricId: metric.id,
          queryLabel: item.source.label,
          metricLabel,
          time,
          dimensions,
          unit,
        };
        const raw =
          row[
            `${metric.aggregation}_${declaration.measures[metric.measure]?.alias ?? metric.measure}`
          ];
        const bins =
          metric.aggregation === "histogram" && Array.isArray(raw) ? raw : null;
        if (values.length + (bins?.length ?? 1) > 100_000) {
          return {
            values: [],
            bucketTimes: [],
            series: [],
            pending: false,
            status: "error" as const,
            failures: [
              {
                id: item.source.id,
                label: item.source.label,
                message:
                  "The chart returned too many values. Narrow its time range or breakdown.",
              },
            ],
          };
        }
        if (bins) {
          for (const bin of bins)
            if (Array.isArray(bin) && bin.length >= 3)
              values.push({
                ...common,
                value: finite(bin[2]),
                bin: `[${bin[0]}, ${bin[1]})${bucketUnit ? ` ${bucketUnit}` : ""}`,
              });
        } else {
          const empty =
            count === 0 &&
            !["count", "sum", "uniq"].includes(metric.aggregation);
          values.push({
            ...common,
            value: empty ? null : finite(raw),
            ...(item.source.view.startsWith("scores-") &&
            metric.measure === "value" &&
            metric.aggregation === "avg" &&
            count !== null
              ? { evaluationCount: count }
              : {}),
          });
        }
      }
    }
  }
  const sourceOrder = new Map(
    plan.queries
      .flatMap((query) =>
        query.source.metrics.map((metric) => `${query.source.id}.${metric.id}`),
      )
      .map((id, index) => [id, index]),
  );
  const series = [...descriptions.values()]
    .sort((a, b) => {
      const order =
        (sourceOrder.get(a.id.split(":")[0]!) ?? 0) -
        (sourceOrder.get(b.id.split(":")[0]!) ?? 0);
      return order || (a.id < b.id ? -1 : Number(a.id > b.id));
    })
    .map((series, index) => ({
      ...series,
      color: seriesColor(index),
      fillColor: seriesFillColor(index),
    }));
  return {
    values,
    bucketTimes: [...bucketTimes].sort(),
    series,
    failures,
    pending,
    status: (() => {
      if (pending) return "loading" as const;
      if (failures.length > 0)
        return failures.length === plan.queries.length
          ? ("error" as const)
          : ("partial" as const);
      return "complete" as const;
    })(),
  };
}
