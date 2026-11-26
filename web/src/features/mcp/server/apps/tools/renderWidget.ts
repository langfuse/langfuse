import { z } from "zod";
import startCase from "lodash/startCase";
import {
  DashboardWidgetChartType,
  InvalidRequestError,
  isoDateTime,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import {
  getResultUnit,
  getViewDeclaration,
  validateQuery,
  type QueryType,
} from "@langfuse/shared/query";
import { executeQuery } from "@langfuse/shared/query/server";
import {
  buildDashboardWidgetUrl,
  buildDashboardsUrl,
  DashboardService,
  getEnvironmentsForProject,
} from "@langfuse/shared/src/server";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { clampToDataAccessDays } from "@/src/features/entitlements/server/hasEntitlementLimit";
import { isTimeSeriesChart } from "@/src/features/widgets/chart-library/utils";
import { buildWidgetQuery } from "@/src/features/widgets/fns/buildWidgetQuery";
import {
  normalizePublicDashboardWidgetInput,
  toPublicWidgetInput,
  validatePublicDashboardWidgetInput,
} from "@/src/features/widgets/server/public-dashboard-widget-service";
import { sanitizePivotTableDefaultSort } from "@/src/features/widgets/utils";
import {
  PostUnstableDashboardWidgetBody,
  type PostUnstableDashboardWidgetBodyType,
} from "@/src/features/public-api/types/unstable-dashboard-widgets";
import { defineTool } from "../../../core/define-tool";
import { MCP_CLICKHOUSE_SETTINGS } from "../../../core/clickhouse-settings";
import { appToolResult } from "../../../core/mcp-app";
import { runMcpTool } from "../../../core/run-mcp-tool";
import {
  convertSelectedEnvironmentsToFilter,
  isEnvironmentVisibleByDefault,
} from "@/src/utils/environmentFilter";
import type { ServerContext } from "../../../types";
import {
  RENDER_WIDGET_TOOL_NAME,
  type WidgetDefinition,
  type WidgetPayload,
} from "../../../core/widget-payload";
import {
  CreateDashboardWidgetBaseSchema,
  throwActionableDashboardWidgetError,
} from "../../dashboardWidgets/tools/createDashboardWidget";
import { WIDGET_APP_RESOURCE_URI } from "../resources";
import { summarizeWidget } from "./widgetSummary";
import {
  DEFAULT_WIDGET_TIME_RANGE,
  WIDGET_TIME_RANGES,
  type WidgetTimeRange,
} from "../../../core/widget-time-ranges";

const timeRanges = z.enum([...WIDGET_TIME_RANGES.keys()] as [
  string,
  ...string[],
]);

const renderOptions = {
  widgetId: z
    .string()
    .optional()
    .describe(
      "Id of a saved dashboard widget to render (see listDashboardWidgets). When set, the widget's own definition is used and the ad-hoc fields are ignored.",
    ),
  timeRange: timeRanges
    .optional()
    .describe(
      `Time window ending now. Defaults to ${DEFAULT_WIDGET_TIME_RANGE}. Ignored when fromTimestamp and toTimestamp are set.`,
    ),
  fromTimestamp: isoDateTime({ offset: true })
    .optional()
    .describe(
      "Start of a custom time window, as an ISO 8601 timestamp with timezone. Set together with toTimestamp; together they replace timeRange.",
    ),
  toTimestamp: isoDateTime({ offset: true })
    .optional()
    .describe(
      "End of a custom time window, as an ISO 8601 timestamp with timezone. Must be after fromTimestamp.",
    ),
};

/**
 * An ad-hoc chart is a widget definition in createDashboardWidget's shape, so
 * the same arguments render a chart here and save it there. Everything is
 * optional because a saved widget (widgetId) needs none of it.
 */
const RenderWidgetBaseSchema = CreateDashboardWidgetBaseSchema.partial().extend(
  {
    ...renderOptions,
    name: z
      .string()
      .optional()
      .describe("Title shown above the chart. Defaults to the metric name."),
    chartType: z
      .enum(DashboardWidgetChartType)
      .optional()
      .describe(
        "NUMBER for a single value, LINE_TIME_SERIES / AREA_TIME_SERIES / BAR_TIME_SERIES over time, HORIZONTAL_BAR / VERTICAL_BAR / PIE for a breakdown, PIVOT_TABLE for a table, HISTOGRAM for a distribution. Defaults to NUMBER, or HORIZONTAL_BAR with a dimension.",
      ),
  },
);

const RenderWidgetInputSchema = PostUnstableDashboardWidgetBody.partial()
  .extend(renderOptions)
  .superRefine((input, ctx) => {
    if (
      (input.fromTimestamp === undefined) !==
      (input.toTimestamp === undefined)
    ) {
      ctx.addIssue({
        code: "custom",
        path: [input.fromTimestamp ? "toTimestamp" : "fromTimestamp"],
        message: "fromTimestamp and toTimestamp must be set together",
      });
    } else if (
      input.fromTimestamp &&
      input.toTimestamp &&
      new Date(input.fromTimestamp) >= new Date(input.toTimestamp)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["toTimestamp"],
        message: "toTimestamp must be after fromTimestamp",
      });
    }
    if (input.widgetId) return;
    if (!input.view) {
      ctx.addIssue({
        code: "custom",
        path: ["view"],
        message: "view is required unless widgetId is set",
      });
    }
    if (!input.metrics || input.metrics.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["metrics"],
        message: "at least one metric is required unless widgetId is set",
      });
    }
  });
type RenderWidgetInput = z.infer<typeof RenderWidgetInputSchema>;

/**
 * Charts read the events-backed v2 views, like queryMetrics. The apps
 * feature is offered under the same flag (../index.ts). Saved v1 widgets,
 * `traces` included, have v2 declarations too.
 */
const VERSION = "v2";

const toDay = (date: Date) => date.toISOString().slice(0, 10);

const metricAlias = (m: WidgetDefinition["metrics"][number]) =>
  `${m.agg}_${m.measure}`;

const aggregationLabel = (aggregation: string) =>
  /^p\d+$/.test(aggregation) ? aggregation : startCase(aggregation);

const metricLabel = (m: WidgetDefinition["metrics"][number]) =>
  m.agg === "count" && m.measure === "count"
    ? "Count"
    : `${aggregationLabel(m.agg)} ${startCase(m.measure).toLowerCase()}`;

const loadSavedWidget = async (widgetId: string, context: ServerContext) => {
  const widget = await DashboardService.getWidget(widgetId, context.projectId);
  if (!widget) {
    throw new LangfuseNotFoundError(`Dashboard widget ${widgetId} not found`);
  }
  return toPublicWidgetInput(widget);
};

/**
 * An ad-hoc widget, checked and normalized the way createDashboardWidget
 * does it, so a definition renders exactly when it could be saved.
 */
const adHocWidget = (input: RenderWidgetInput) => {
  const metrics = input.metrics!;
  const dimensions = input.dimensions ?? [];
  const widget = {
    name: input.name ?? metricLabel(metrics[0]!),
    description: input.description ?? "",
    view: input.view!,
    dimensions,
    metrics,
    filters: input.filters ?? [],
    chartType:
      input.chartType ?? (dimensions.length > 0 ? "HORIZONTAL_BAR" : "NUMBER"),
    chartConfig: input.chartConfig,
  } satisfies PostUnstableDashboardWidgetBodyType;
  try {
    const normalized = normalizePublicDashboardWidgetInput(widget);
    validatePublicDashboardWidgetInput(normalized);
    return normalized;
  } catch (error) {
    return throwActionableDashboardWidgetError(error, widget);
  }
};

type ChartedWidget = Awaited<ReturnType<typeof loadSavedWidget>>;

type TimeWindow = {
  /** The range as requested: a relative preset or a custom window. */
  requested: WidgetTimeRange;
  fromTimestamp: Date;
  toTimestamp: Date;
  /** The earliest time the plan's data access allows, if it limits it. */
  accessFloor?: Date;
  label: string;
};

const toMinute = (date: Date) =>
  `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;

/** The range actually queried, naming the plan's limit when it shortened it. */
const windowLabel = (params: {
  custom: boolean;
  relativeLabel: string;
  fromTimestamp: Date;
  toTimestamp: Date;
  clamped: boolean;
}) => {
  const limitNote = " (plan data access limit)";
  if (params.custom) {
    const span = `${toMinute(params.fromTimestamp)} – ${toMinute(params.toTimestamp)}`;
    return params.clamped ? span + limitNote : span;
  }
  // A relative range ends now, so its shortened form is "since" its start.
  return params.clamped
    ? `Since ${toDay(params.fromTimestamp)}${limitNote}`
    : params.relativeLabel;
};

/**
 * The requested window: a custom from/to, or a relative range ending now.
 * Its start is shortened to the plan's data access limit.
 */
const resolveTimeWindow = (
  input: Pick<RenderWidgetInput, "timeRange" | "fromTimestamp" | "toTimestamp">,
  context: ServerContext,
): TimeWindow => {
  const custom =
    input.fromTimestamp && input.toTimestamp
      ? { from: input.fromTimestamp, to: input.toTimestamp }
      : undefined;
  const rangeKey = input.timeRange ?? DEFAULT_WIDGET_TIME_RANGE;
  const range = WIDGET_TIME_RANGES.get(rangeKey)!;
  const toTimestamp = custom ? new Date(custom.to) : new Date();
  const requestedFrom = custom
    ? new Date(custom.from)
    : new Date(toTimestamp.getTime() - (range.minutes ?? 0) * 60_000);
  const access = clampToDataAccessDays({
    plan: context.plan,
    fromTimestamp: requestedFrom.toISOString(),
  });
  const fromTimestamp = access.effectiveFromTimestamp ?? requestedFrom;
  if (fromTimestamp >= toTimestamp) {
    throw new InvalidRequestError(
      `The time window ends before ${toDay(fromTimestamp)}, the earliest date the plan's data access allows`,
    );
  }
  return {
    requested: custom ?? { range: rangeKey },
    fromTimestamp,
    toTimestamp,
    accessFloor: access.accessFloor,
    label: windowLabel({
      custom: Boolean(custom),
      relativeLabel: range.label,
      fromTimestamp,
      toTimestamp,
      clamped: access.wasClamped,
    }),
  };
};

/**
 * The widget's own filters (stored in the dashboard's table-column form),
 * plus the dashboard's default environment selection unless the widget
 * filters environments itself: Langfuse's own `langfuse-*` traffic is left
 * out, as on the dashboard tile.
 */
const resolveFilters = async (
  widget: ChartedWidget,
  projectId: string,
  window: TimeWindow,
) => {
  const ownFilters = mapLegacyUiTableFilterToView(widget.view, widget.filters);
  if (ownFilters.some((filter) => filter.column === "environment")) {
    return ownFilters;
  }
  const environments = await getEnvironmentsForProject({
    projectId,
    fromTimestamp: window.fromTimestamp,
  });
  return [
    ...ownFilters,
    ...convertSelectedEnvironmentsToFilter(
      ["environment"],
      environments
        .map(({ environment }) => environment)
        .filter(isEnvironmentVisibleByDefault),
    ),
  ];
};

/**
 * The dashboard's query for the widget. Every row goes into one MCP
 * response, so pivot tables get the same row limit as other breakdowns;
 * validateQuery rejects unbounded high-cardinality time series.
 */
const buildRenderQuery = (
  widget: ChartedWidget,
  filters: QueryType["filters"],
  window: TimeWindow,
) => {
  const query = buildWidgetQuery({
    widget,
    filters,
    fromTimestamp: window.fromTimestamp,
    toTimestamp: window.toTimestamp,
    // The view has no sortable header, so a saved pivot's sort applies here;
    // it decides which rows survive the row limit.
    sortState:
      widget.chartConfig.type === "PIVOT_TABLE"
        ? (sanitizePivotTableDefaultSort(
            widget.chartConfig.defaultSort,
            widget,
          ) ?? null)
        : null,
    version: VERSION,
  });
  if (
    query.chartConfig &&
    widget.dimensions.length > 0 &&
    !isTimeSeriesChart(widget.chartType)
  ) {
    query.chartConfig.row_limit = query.chartConfig.row_limit ?? 100;
  }
  return query;
};

const runQuery = async (query: QueryType, projectId: string) => {
  const validation = validateQuery(query, VERSION);
  if (!validation.valid) {
    throw new InvalidRequestError(validation.reason);
  }
  return executeQuery(projectId, query, VERSION, true, {
    clickhouseSettings: MCP_CLICKHOUSE_SETTINGS,
  });
};

/**
 * Whether the first dimension can return one source row more than once:
 * array dimensions (`toolNames`) and key-value dimensions (`costType`,
 * whose keys include `total`). Its rows then do not add up to a total.
 */
const dimensionRepeatsRows = (widget: ChartedWidget) => {
  const field = widget.dimensions[0]?.field;
  if (!field) return false;
  const declaration = getViewDeclaration(widget.view, VERSION).dimensions[
    field
  ];
  return Boolean(declaration?.explodeArray || declaration?.pairExpand);
};

const toRenderResult = (params: {
  widget: ChartedWidget;
  rows: Record<string, unknown>[];
  window: TimeWindow;
  rowLimit: number | undefined;
  url: string;
}) => {
  const { widget, rows, window } = params;
  const firstMetric = widget.metrics[0]!;
  const payload: WidgetPayload = {
    name: widget.name,
    description: widget.description,
    chartType: widget.chartType,
    chartConfig: widget.chartConfig,
    view: widget.view,
    version: VERSION,
    metrics: widget.metrics,
    dimensions: widget.dimensions,
    rows,
    timeRange: window.requested,
    timeRangeLabel: window.label,
    earliestTimestamp: window.accessFloor?.toISOString(),
  };
  return appToolResult({
    text: JSON.stringify({
      note: "Summary of the chart's data. When rowsLimited is set, only the top rows by the first metric were queried and the summary covers those. Hosts that support MCP Apps also show the chart to the user.",
      title: widget.name,
      chartType: widget.chartType,
      metric: metricAlias(firstMetric),
      unit: getResultUnit(
        widget.view,
        firstMetric.measure,
        firstMetric.agg,
        VERSION,
      ),
      dimension: widget.dimensions[0]?.field ?? null,
      timeRange: window.label,
      from: window.fromTimestamp.toISOString(),
      to: window.toTimestamp.toISOString(),
      ...summarizeWidget({
        ...widget,
        rows,
        rowLimit: params.rowLimit,
        dimensionRepeatsRows: dimensionRepeatsRows(widget),
      }),
      url: params.url,
    }),
    // Rows for the MCP App view; hosts keep result _meta from the model.
    meta: { widget: payload },
  });
};

export const [renderWidgetTool, handleRenderWidget] = defineTool({
  name: RENDER_WIDGET_TOOL_NAME,
  action: "metrics:read",
  description: [
    "Render a Langfuse chart inline in the chat: a big number, a time series, a breakdown, a table or a histogram.",
    "Use it whenever a metrics question is better answered visually, e.g. 'what is our average cost?', 'latency by model this week', or to show a saved dashboard widget (pass widgetId).",
    "For an ad-hoc chart pass a widget definition in the same shape as createDashboardWidget (view, metrics with agg, dimensions, filters, chartType, chartConfig); it is rendered, not saved. To save the chart, pass the same arguments to createDashboardWidget.",
    "Pick the time range with timeRange, or a custom window with fromTimestamp and toTimestamp, and call the tool again for another range. The text result summarizes the chart (totals, peaks, latest values per series) and links to Langfuse; no follow-up query is needed to describe it.",
  ].join(" "),
  baseSchema: RenderWidgetBaseSchema,
  inputSchema: RenderWidgetInputSchema,
  annotations: { readOnlyHint: true },
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
        const widget = input.widgetId
          ? await loadSavedWidget(input.widgetId, context)
          : adHocWidget(input);
        if (widget.metrics.length === 0) {
          throw new InvalidRequestError("The widget has no metrics");
        }
        const window = resolveTimeWindow(input, context);
        const filters = await resolveFilters(widget, context.projectId, window);
        const query = buildRenderQuery(widget, filters, window);
        const rows = await runQuery(query, context.projectId);
        return toRenderResult({
          widget,
          rows,
          window,
          rowLimit: query.chartConfig?.row_limit,
          url: input.widgetId
            ? buildDashboardWidgetUrl({
                projectId: context.projectId,
                widgetId: input.widgetId,
              })
            : buildDashboardsUrl({ projectId: context.projectId }),
        });
      },
    }),
});
