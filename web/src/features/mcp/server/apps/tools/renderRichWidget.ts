import { InvalidRequestError, singleFilterList } from "@langfuse/shared";
import {
  dashboardBlockContentSchema,
  multiQueryTabAsChart,
  normalizeMultiQueryConfig,
} from "@langfuse/shared/dashboards";
import { executeQuery } from "@langfuse/shared/query/server";
import { getEnvironmentsForProject } from "@langfuse/shared/src/server";
import {
  buildMultiQueryPlan,
  normalizeMultiQueryResults,
} from "@/src/features/dashboard-blocks/multi-query/multiQueryModel";
import { applyMultiQueryFormulas } from "@/src/features/dashboard-blocks/multi-query/multiQueryFormulas";
import {
  homeScoreInput,
  homeScoreRows,
} from "@/src/features/dashboard-blocks/multi-query/homeScoreAggregate";
import { getScoreAggregateV2 } from "@/src/features/dashboard/server/dashboard-router";
import {
  convertSelectedEnvironmentsToFilter,
  isEnvironmentVisibleByDefault,
} from "@/src/utils/environmentFilter";
import { appToolResult } from "../../../core/mcp-app";
import { MCP_CLICKHOUSE_SETTINGS } from "../../../core/clickhouse-settings";
import {
  type WidgetDefinition,
  type WidgetPayload,
} from "../../../core/widget-payload";
import { type WidgetTimeRange } from "../../../core/widget-time-ranges";

/** Render one tab at a time; switching tabs uses the same authenticated MCP tool. */
export async function renderRichWidget({
  widget,
  definition: rawDefinition,
  projectId,
  tabId,
  window,
  url,
}: {
  widget?: WidgetDefinition;
  definition: unknown;
  projectId: string;
  tabId: string | undefined;
  window: {
    requested: WidgetTimeRange;
    fromTimestamp: Date;
    toTimestamp: Date;
    accessFloor?: Date;
    label: string;
  };
  url: string;
}) {
  const definition = dashboardBlockContentSchema.parse(rawDefinition);
  const dates = {
    from: window.fromTimestamp.toISOString(),
    to: window.toTimestamp.toISOString(),
  };
  const payload: WidgetPayload = {
    name: widget?.name ?? definition.config.title,
    description:
      widget?.description ??
      (definition.kind === "multiQuery" ? definition.config.description : ""),
    chartType: widget?.chartType ?? "NUMBER",
    chartConfig: widget?.chartConfig ?? { type: "NUMBER" },
    view: widget?.view ?? "observations",
    metrics: widget?.metrics ?? [],
    dimensions: widget?.dimensions ?? [],
    version: "v2",
    rows: [],
    timeRange: window.requested,
    timeRangeLabel: window.label,
    earliestTimestamp: window.accessFloor?.toISOString(),
  };
  if (definition.kind === "markdown") {
    payload.rich = { definition, ...dates };
    return appToolResult({
      text: JSON.stringify({
        title: definition.config.title,
        markdown: definition.config.content,
        url,
      }),
      meta: { widget: payload },
    });
  }
  const config = normalizeMultiQueryConfig(definition.config);
  const tab = tabId
    ? config.tabs.find((tab) => tab.id === tabId)
    : config.tabs[0];
  if (!tab)
    throw new InvalidRequestError(
      "This widget tab no longer exists. Render the widget without tabId to select its first tab.",
    );
  const sourceUrl = new URL(url);
  sourceUrl.searchParams.set("tabId", tab.id);
  const environments = await getEnvironmentsForProject({
    projectId,
    fromTimestamp: window.fromTimestamp,
  });
  const plan = buildMultiQueryPlan(multiQueryTabAsChart(tab), {
    dateRange: { from: window.fromTimestamp, to: window.toTimestamp },
    readPath: "v4",
    filterState: convertSelectedEnvironmentsToFilter(
      ["environment"],
      environments
        .map(({ environment }) => environment)
        .filter(isEnvironmentVisibleByDefault),
    ),
  });
  const cache = new Map<string, Promise<Record<string, unknown>[]>>();
  const results = [];
  // Sequential execution bounds a tool call to one source (at most two score
  // queries) in flight. Identical operands share results within the call.
  for (const source of plan.queries) {
    const key = JSON.stringify({
      query: source.query,
      version: source.version,
      scores: source.homeScoreFilters,
    });
    let request = cache.get(key);
    if (!request) {
      request = source.homeScoreFilters
        ? getScoreAggregateV2({
            projectId,
            filter: singleFilterList.parse(
              homeScoreInput(
                projectId,
                "v2",
                source.query,
                source.homeScoreFilters,
              ).filter ?? [],
            ),
            executionOptions: { clickhouseSettings: MCP_CLICKHOUSE_SETTINGS },
          }).then((rows) => homeScoreRows(source.query, rows))
        : executeQuery(projectId, source.query, source.version, true, {
            clickhouseSettings: MCP_CLICKHOUSE_SETTINGS,
          });
      cache.set(key, request);
    }
    try {
      results.push({
        data: await request,
        isPending: false,
        isError: false,
        error: null,
      });
    } catch (error) {
      results.push({
        data: undefined,
        isPending: false,
        isError: true,
        error:
          error instanceof Error
            ? error.message
            : "This series could not be loaded",
      });
    }
  }
  const result = normalizeMultiQueryResults(plan, results);
  // Source predicates remain on the server. The view needs only labels,
  // metric IDs and display options to calculate formulas and draw the data.
  payload.rich = {
    definition: {
      kind: "multiQuery",
      config: {
        ...config,
        tabs: config.tabs.map((tab) => ({
          ...tab,
          queries: tab.queries.map((source) => ({ ...source, filters: [] })),
        })),
      },
    },
    activeTabId: tab.id,
    warnings: plan.warnings,
    result,
    ...dates,
  };
  const computed = applyMultiQueryFormulas(tab, result, "v4");
  return appToolResult({
    text: JSON.stringify({
      title: config.title,
      tab: tab.label,
      tabs: config.tabs.map(({ id, label }) => ({ id, label })),
      chartType: tab.display.chartType,
      timeRange: window.label,
      ...dates,
      status: computed.status,
      warnings: plan.warnings,
      failures: computed.failures,
      // A bounded sample avoids flooding model context; the app receives all
      // returned values, including operands for browser-computed formulas.
      values: computed.values
        .slice(0, 100)
        .map(({ queryLabel, metricLabel, time, dimensions, value, unit }) => ({
          series: queryLabel,
          metric: metricLabel,
          time,
          dimensions,
          value,
          unit,
        })),
      valuesTruncated: computed.values.length > 100,
      url: sourceUrl.toString(),
    }),
    meta: { widget: payload },
  });
}
