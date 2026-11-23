import { z } from "zod";
import startCase from "lodash/startCase";
import {
  DashboardWidgetChartType,
  InvalidRequestError,
  LangfuseNotFoundError,
  singleFilterList,
  type FilterState,
} from "@langfuse/shared";
import {
  buildWidgetOrderBy,
  dimension,
  getResultUnit,
  getViewDeclaration,
  isV2BreakdownChart,
  metric,
  resolveWidgetRenderVersion,
  toQueryChartConfig,
  validateQuery,
  type views,
  viewsV2,
  type QueryType,
  type ViewVersion,
} from "@langfuse/shared/query";
import { executeQuery } from "@langfuse/shared/query/server";
import {
  buildDashboardWidgetUrl,
  buildDashboardsUrl,
  DashboardService,
  dashboardWidgetViewToQueryView,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { clampToDataAccessDays } from "@/src/features/entitlements/server/hasEntitlementLimit";
import { isTimeSeriesChart } from "@/src/features/widgets/chart-library/utils";
import { sanitizePivotTableDefaultSort } from "@/src/features/widgets/utils";
import { defineTool } from "../../../core/define-tool";
import { McpAdvancedFilterBaseSchema } from "../../../core/filter-schema";
import { MCP_CLICKHOUSE_SETTINGS } from "../../../core/clickhouse-settings";
import { appToolResult } from "../../../core/mcp-app";
import { runMcpTool } from "../../../core/run-mcp-tool";
import type { ServerContext } from "../../../types";
import { type WidgetPayload } from "../../../core/widget-payload";
import { WIDGET_APP_RESOURCE_URI } from "../resources";
import { summarizeWidget, toNumber } from "./widgetSummary";

const TIME_RANGES = {
  "1h": { ms: 60 * 60 * 1000, label: "Last hour" },
  "24h": { ms: 24 * 60 * 60 * 1000, label: "Last 24 hours" },
  "7d": { ms: 7 * 24 * 60 * 60 * 1000, label: "Last 7 days" },
  "30d": { ms: 30 * 24 * 60 * 60 * 1000, label: "Last 30 days" },
  "90d": { ms: 90 * 24 * 60 * 60 * 1000, label: "Last 90 days" },
} as const;
const timeRanges = z.enum(
  Object.keys(TIME_RANGES) as [keyof typeof TIME_RANGES],
);
type TimeRange = z.infer<typeof timeRanges>;

const RenderWidgetBaseSchema = z.object({
  widgetId: z
    .string()
    .optional()
    .describe(
      "Id of a saved dashboard widget to render (see listDashboardWidgets). When set, the widget's own view, metrics, dimensions, filters and chart type are used and the ad-hoc fields are ignored.",
    ),
  title: z
    .string()
    .optional()
    .describe("Title shown above the chart. Defaults to the metric name."),
  // The views queryMetrics offers; trace charts exist only as saved widgets.
  view: viewsV2
    .optional()
    .describe(
      "Ad-hoc chart: data view to query. Field names follow getMetricsSchema.",
    ),
  metrics: z
    .array(metric)
    .optional()
    .describe(
      "Ad-hoc chart: measures and aggregations, e.g. [{ measure: 'totalCost', aggregation: 'avg' }]. The first metric is plotted.",
    ),
  dimensions: z
    .array(dimension)
    .optional()
    .describe(
      "Ad-hoc chart: at most one breakdown dimension, e.g. [{ field: 'providedModelName' }].",
    ),
  filters: z
    .array(McpAdvancedFilterBaseSchema)
    .optional()
    .describe("Ad-hoc chart: filters in the same shape as queryMetrics."),
  chartType: z
    .enum(DashboardWidgetChartType)
    .optional()
    .describe(
      "Ad-hoc chart: NUMBER for a single value with trend, LINE_TIME_SERIES / AREA_TIME_SERIES / BAR_TIME_SERIES over time, HORIZONTAL_BAR / VERTICAL_BAR / PIE for a breakdown, PIVOT_TABLE for a table. Defaults to NUMBER, or HORIZONTAL_BAR with a dimension.",
    ),
  timeRange: timeRanges
    .optional()
    .describe("Time window ending now. Defaults to 7d."),
});

const RenderWidgetInputSchema = RenderWidgetBaseSchema.extend({
  filters: singleFilterList.optional(),
}).superRefine((input, ctx) => {
  if (input.widgetId) return;
  if (!input.view) {
    ctx.addIssue({
      code: "custom",
      path: ["view"],
      message: "view is required unless widgetId is set",
    });
  }
  if (!input.metrics?.length) {
    ctx.addIssue({
      code: "custom",
      path: ["metrics"],
      message: "at least one metric is required unless widgetId is set",
    });
  }
});
type RenderWidgetInput = z.infer<typeof RenderWidgetInputSchema>;

type WidgetSpec = {
  title: string;
  description?: string;
  view: z.infer<typeof views>;
  metrics: {
    measure: string;
    aggregation: z.infer<typeof metric>["aggregation"];
  }[];
  dimensions: { field: string }[];
  filters: FilterState;
  chartType: DashboardWidgetChartType;
  chartConfig: {
    type: string;
    bins?: number;
    row_limit?: number;
    defaultSort?: { column: string; order: "ASC" | "DESC" };
  };
  version: ViewVersion;
  url: string;
};

/**
 * The newest query version with current data. Only legacy-mode deployments
 * still write the v1 tables alone; elsewhere the events-backed v2 views are
 * current, as queryMetrics assumes.
 */
const newestReadableVersion = (): ViewVersion =>
  env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "legacy" ? "v1" : "v2";

const toDay = (date: Date) => date.toISOString().slice(0, 10);

const metricAlias = (m: { measure: string; aggregation: string }) =>
  `${m.aggregation}_${m.measure}`;

const aggregationLabel = (aggregation: string) =>
  /^p\d+$/.test(aggregation) ? aggregation : startCase(aggregation);

const metricLabel = (m: { measure: string; aggregation: string }) =>
  m.aggregation === "count" && m.measure === "count"
    ? "Count"
    : `${aggregationLabel(m.aggregation)} ${startCase(m.measure).toLowerCase()}`;

const loadSavedWidgetSpec = async (
  widgetId: string,
  context: ServerContext,
): Promise<WidgetSpec> => {
  const widget = await DashboardService.getWidget(widgetId, context.projectId);
  if (!widget) {
    throw new LangfuseNotFoundError(`Dashboard widget ${widgetId} not found`);
  }
  const view = dashboardWidgetViewToQueryView[widget.view];
  const metrics = widget.metrics.map((m) => ({
    measure: m.measure,
    aggregation: m.agg as WidgetSpec["metrics"][number]["aggregation"],
  }));
  return {
    title: widget.name,
    description: widget.description || undefined,
    view,
    metrics,
    dimensions: widget.dimensions,
    filters: mapLegacyUiTableFilterToView(view, widget.filters),
    chartType: widget.chartType,
    chartConfig: widget.chartConfig,
    version: resolveWidgetRenderVersion({
      shape: {
        view,
        dimensions: widget.dimensions,
        measures: metrics.map((m) => ({ measure: m.measure })),
        filters: widget.filters,
      },
      persistedMinVersion: widget.minVersion,
      newestReadableVersion: newestReadableVersion(),
    }),
    url: buildDashboardWidgetUrl({ projectId: context.projectId, widgetId }),
  };
};

const adHocSpec = (
  input: RenderWidgetInput,
  context: ServerContext,
): WidgetSpec => {
  const view = input.view!;
  const metrics = input.metrics!;
  const dimensions = (input.dimensions ?? []).slice(0, 1);
  const chartType =
    input.chartType ?? (dimensions.length > 0 ? "HORIZONTAL_BAR" : "NUMBER");
  return {
    title: input.title ?? metricLabel(metrics[0]!),
    view,
    metrics,
    dimensions,
    filters: input.filters ?? [],
    chartType,
    chartConfig: { type: chartType },
    version: newestReadableVersion(),
    url: buildDashboardsUrl({ projectId: context.projectId }),
  };
};

export const [renderWidgetTool, handleRenderWidget] = defineTool({
  name: "renderWidget",
  action: "metrics:read",
  description: [
    "Render a Langfuse chart inline in the chat: a big number with trend, a time series, a breakdown, or a table.",
    "Use it whenever a metrics question is better answered visually, e.g. 'what is our average cost?', 'latency by model this week', or to show a saved dashboard widget (pass widgetId).",
    "For ad-hoc charts pass view + metrics (+ optional dimension and filters) with the same field names as queryMetrics/getMetricsSchema.",
    "Pick the time range with timeRange and call the tool again for another range. The text result is a complete summary of the chart (totals, peaks, latest values per series) and links to Langfuse; no follow-up query is needed to describe it.",
  ].join(" "),
  baseSchema: RenderWidgetBaseSchema,
  inputSchema: RenderWidgetInputSchema,
  readOnlyHint: true,
  ui: { resourceUri: WIDGET_APP_RESOURCE_URI },
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.apps.render_widget",
      context,
      attributes: {
        "mcp.widget_id": input.widgetId,
        "mcp.widget_view": input.view,
        "mcp.widget_time_range": input.timeRange,
      },
      fn: async () => {
        const spec = input.widgetId
          ? await loadSavedWidgetSpec(input.widgetId, context)
          : adHocSpec(input, context);
        const timeRange: TimeRange = input.timeRange ?? "7d";
        const toTimestamp = new Date();
        const requestedFrom = new Date(
          toTimestamp.getTime() - TIME_RANGES[timeRange].ms,
        );
        const access = clampToDataAccessDays({
          plan: context.plan,
          fromTimestamp: requestedFrom.toISOString(),
        });
        const fromTimestamp = access.effectiveFromTimestamp ?? requestedFrom;
        // Name the range actually queried when the plan shortened it.
        const timeRangeLabel = access.wasClamped
          ? `Since ${toDay(fromTimestamp)} (plan data access limit)`
          : TIME_RANGES[timeRange].label;

        const firstMetric = spec.metrics[0];
        if (!firstMetric) {
          throw new InvalidRequestError("The widget has no metrics");
        }
        const isTimeSeries = isTimeSeriesChart(spec.chartType);
        const hasDimension = spec.dimensions.length > 0;
        // Every result goes into one MCP response, so breakdowns are bounded
        // on any query version, not only where v2 validation requires it:
        // the top rows by the first metric, and no high-cardinality series.
        const needsTopN = isV2BreakdownChart({
          version: "v2",
          hasDimension,
          isTimeSeries,
          chartType: spec.chartType,
        });
        const viewDimensions = getViewDeclaration(
          spec.view,
          spec.version,
        ).dimensions;
        const unboundedSeries = isTimeSeries
          ? spec.dimensions.find(
              (d) => viewDimensions[d.field]?.highCardinality,
            )
          : undefined;
        if (unboundedSeries) {
          throw new InvalidRequestError(
            `${unboundedSeries.field} has too many values to chart over time. Use a breakdown chart such as HORIZONTAL_BAR for its top values.`,
          );
        }

        const buildQuery = (overrides: Partial<QueryType>): QueryType => ({
          view: spec.view,
          dimensions: spec.dimensions,
          metrics: spec.metrics,
          filters: spec.filters,
          timeDimension: isTimeSeries ? { granularity: "auto" } : null,
          fromTimestamp: fromTimestamp.toISOString(),
          toTimestamp: toTimestamp.toISOString(),
          orderBy: buildWidgetOrderBy({
            chartType: spec.chartType,
            // A saved pivot's sort decides which rows survive the row limit.
            sortState:
              spec.chartType === "PIVOT_TABLE"
                ? (sanitizePivotTableDefaultSort(spec.chartConfig.defaultSort, {
                    dimensions: spec.dimensions,
                    metrics: spec.metrics.map((m) => ({
                      measure: m.measure,
                      agg: m.aggregation,
                    })),
                  }) ?? null)
                : null,
            needsTopN,
            firstMetric,
          }),
          chartConfig: toQueryChartConfig(spec.chartConfig, {
            defaultRowLimit: hasDimension && !isTimeSeries ? 100 : undefined,
          }),
          ...overrides,
        });

        const run = async (query: QueryType) => {
          const validation = validateQuery(query, spec.version);
          if (!validation.valid) {
            throw new InvalidRequestError(validation.reason);
          }
          return executeQuery(
            context.projectId,
            query,
            spec.version,
            spec.version === "v2",
            { clickhouseSettings: MCP_CLICKHOUSE_SETTINGS },
          );
        };

        const alias = metricAlias(firstMetric);
        const dimensionField = spec.dimensions[0]?.field;
        const unit = getResultUnit(
          spec.view,
          firstMetric.measure,
          firstMetric.aggregation,
          spec.version,
        );

        // A single number also gets a trend and the previous period's value,
        // so it reads like a KPI tile rather than a bare figure. The previous
        // period is compared only when the plan can read all of it.
        const isNumber = spec.chartType === "NUMBER" && !dimensionField;
        const periodMs = toTimestamp.getTime() - fromTimestamp.getTime();
        const previousFrom = new Date(fromTimestamp.getTime() - periodMs);
        const comparePrevious =
          isNumber &&
          (!access.accessFloor || previousFrom >= access.accessFloor);
        const [rows, trendRows, previousRows] = await Promise.all([
          run(buildQuery({})),
          isNumber
            ? run(
                buildQuery({
                  timeDimension: { granularity: "auto" },
                  chartConfig: { type: "LINE_TIME_SERIES" },
                }),
              )
            : Promise.resolve([]),
          comparePrevious
            ? run(
                buildQuery({
                  fromTimestamp: previousFrom.toISOString(),
                  toTimestamp: fromTimestamp.toISOString(),
                }),
              )
            : Promise.resolve([]),
        ]);

        const value = isNumber ? toNumber(rows[0]?.[alias]) : null;
        const previousValue = comparePrevious
          ? toNumber(previousRows[0]?.[alias])
          : null;

        const payload: WidgetPayload = {
          title: spec.title,
          description: spec.description,
          chartType: spec.chartType,
          chartConfig: { ...spec.chartConfig, type: spec.chartType },
          view: spec.view,
          version: spec.version,
          metrics: spec.metrics.map((m) => ({
            measure: m.measure,
            agg: m.aggregation,
          })),
          dimensions: spec.dimensions,
          rows,
          ...(isNumber ? { kpi: { value, previousValue, trendRows } } : {}),
          timeRangeLabel,
        };

        return appToolResult({
          text: JSON.stringify({
            note: "Complete summary of the chart's data. Hosts that support MCP Apps also show the chart to the user.",
            title: spec.title,
            chartType: spec.chartType,
            metric: alias,
            unit,
            dimension: dimensionField ?? null,
            timeRange: timeRangeLabel,
            from: fromTimestamp.toISOString(),
            to: toTimestamp.toISOString(),
            ...summarizeWidget({
              rows,
              chartType: spec.chartType,
              metricField: alias,
              metricFields: spec.metrics.map(metricAlias),
              aggregation: firstMetric.aggregation,
              dimensionField,
              dimensionFields: spec.dimensions.map((d) => d.field),
              isTimeSeries,
              kpi: isNumber ? { value, previousValue } : undefined,
            }),
            url: spec.url,
          }),
          // Rows for the MCP App view; hosts keep result _meta from the model.
          meta: { widget: payload },
        });
      },
    }),
});
