import { isoDateTime, InvalidRequestError } from "@langfuse/shared";
import { executeQuery } from "@langfuse/shared/query/server";
import {
  dimension,
  metric,
  validateQuery,
  viewDeclarations,
  viewsV2,
} from "@langfuse/shared/query";
import {
  MetricsQueryObjectV2,
  publicGranularities,
} from "@/src/features/public-api/types/metrics";
import { defineTool } from "../../../core/define-tool";
import { McpAdvancedFilterBaseSchema } from "../../../core/filter-schema";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { MCP_CLICKHOUSE_SETTINGS } from "../../../core/clickhouse-settings";
import { clampToDataAccessDays } from "@/src/features/entitlements/server/hasEntitlementLimit";
import { z } from "zod";

const DEFAULT_ROW_LIMIT = 100;

const normalizeMetricFilters = (
  input: z.infer<typeof MetricsQueryObjectV2>,
): z.infer<typeof MetricsQueryObjectV2> => {
  const tagsDimension = viewDeclarations.v2[input.view].dimensions.tags;
  const tagsAreArray =
    tagsDimension?.type === "string[]" || tagsDimension?.type === "arrayString";

  if (!tagsAreArray) {
    return input;
  }

  return {
    ...input,
    filters: input.filters.map((filter) => {
      if (filter.column !== "tags") {
        return filter;
      }

      if (filter.type === "string" && filter.operator === "=") {
        return {
          type: "arrayOptions",
          column: filter.column,
          operator: "any of",
          value: [filter.value],
        };
      }

      if (filter.type === "stringOptions") {
        return {
          ...filter,
          type: "arrayOptions",
        };
      }

      return filter;
    }),
  };
};

const normalizeMetricOrderByFields = (
  input: z.infer<typeof MetricsQueryObjectV2>,
) => {
  if (!input.orderBy) {
    return input;
  }

  const metricAliases = input.metrics.map(
    (metric) => `${metric.aggregation}_${metric.measure}`,
  );
  const reversedMetricAliases = new Map(
    input.metrics.map((metric) => [
      `${metric.measure}_${metric.aggregation}`,
      `${metric.aggregation}_${metric.measure}`,
    ]),
  );
  const allowedOrderByFields = new Set([
    ...input.dimensions.map((dimension) => dimension.field),
    ...metricAliases,
    ...(input.timeDimension ? ["time_dimension"] : []),
  ]);

  return {
    ...input,
    orderBy: input.orderBy.map((orderBy) => {
      const isDimensionField = input.dimensions.some(
        (dimension) => dimension.field === orderBy.field,
      );
      const matchingMetrics = isDimensionField
        ? []
        : input.metrics.filter((metric) => metric.measure === orderBy.field);
      const normalizedField = (() => {
        if (isDimensionField) {
          return orderBy.field;
        }
        if (matchingMetrics.length === 1) {
          return `${matchingMetrics[0].aggregation}_${matchingMetrics[0].measure}`;
        }
        return reversedMetricAliases.get(orderBy.field) ?? orderBy.field;
      })();

      if (!allowedOrderByFields.has(normalizedField)) {
        throw new InvalidRequestError(
          `Invalid orderBy field: ${orderBy.field}. Use returned metric aliases like 'sum_totalCost' or fields returned by getMetricsSchema.`,
        );
      }

      return {
        ...orderBy,
        field: normalizedField,
      };
    }),
  };
};

const MetricsQueryObjectV2BaseSchema = z.object({
  view: viewsV2.describe(
    "observations covers usage, cost, latency and errors; scores-* views cover scores of that data type.",
  ),
  dimensions: z
    .array(dimension)
    .optional()
    .default([])
    .describe(
      'Group-by fields from getMetricsSchema, e.g. [{ field: "providedModelName" }].',
    ),
  metrics: z
    .array(metric)
    .describe(
      'e.g. [{ measure: "totalCost", aggregation: "sum" }], using each measure\'s validAggregations. Result columns are named <aggregation>_<measure>.',
    ),
  filters: z
    .array(McpAdvancedFilterBaseSchema)
    .optional()
    .default([])
    .describe(
      "ANDed. Take column, type (its filterType) and operator from getMetricsSchema filterableColumns. value is a string array for stringOptions/arrayOptions and an ISO timestamp for datetime; stringObject (metadata) needs key.",
    ),
  timeDimension: z
    .object({
      granularity: publicGranularities,
    })
    .optional()
    .describe(
      "Adds a time_dimension column, one row per bucket per group. Omit for totals.",
    ),
  fromTimestamp: isoDateTime({ offset: true }).describe(
    "ISO 8601 with timezone (Z or offset).",
  ),
  toTimestamp: isoDateTime({ offset: true }).describe(
    "ISO 8601 with timezone; must be after fromTimestamp.",
  ),
  orderBy: z
    .array(
      z.object({
        field: z.string(),
        direction: z.enum(["asc", "desc"]),
      }),
    )
    .optional()
    .describe(
      "field is a dimension, a metric alias such as sum_totalCost, or time_dimension.",
    ),
  config: z
    .object({
      bins: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Bucket count for histogram."),
      row_limit: z
        .number()
        .int()
        .positive()
        .lte(1000)
        .optional()
        .describe("Max rows; default 100."),
    })
    .optional(),
});

export const [queryMetricsTool, handleQueryMetrics] = defineTool({
  name: "queryMetrics",
  action: "metrics:read",
  description: [
    "Run an aggregate analytics query (usage, cost, latency, errors or scores) over one view, optionally grouped by dimensions and bucketed over time. Returns { data: rows }, one per group and time bucket; for individual records use listObservations.",
    "Call getMetricsSchema first: dimensions, measures, aggregations, filter columns and orderBy fields differ per view, and invalid names are rejected.",
    "A fromTimestamp older than the plan's data-access window is moved to the window start.",
  ].join("\n"),
  baseSchema: MetricsQueryObjectV2BaseSchema,
  inputSchema: MetricsQueryObjectV2,
  handler: async (input, context) => {
    return await runMcpTool({
      spanName: "mcp.metrics.query",
      context,
      attributes: {
        "mcp.metrics_view": input.view,
      },
      fn: async () => {
        const normalizedInputUnclamped = normalizeMetricOrderByFields(
          normalizeMetricFilters(input),
        );
        const dataAccessWindow = clampToDataAccessDays({
          plan: context.plan,
          fromTimestamp: normalizedInputUnclamped.fromTimestamp,
        });
        const normalizedInput = {
          ...normalizedInputUnclamped,
          fromTimestamp:
            dataAccessWindow.effectiveFromTimestamp?.toISOString() ??
            normalizedInputUnclamped.fromTimestamp,
        };
        const validation = validateQuery(normalizedInput, "v2");

        if (!validation.valid) {
          throw new InvalidRequestError(validation.reason);
        }

        const { config, ...query } = normalizedInput;
        const queryParams = {
          ...query,
          chartConfig: {
            type: "TABLE",
            ...config,
            row_limit: config?.row_limit ?? DEFAULT_ROW_LIMIT,
          },
        };

        const result = await executeQuery(
          context.projectId,
          queryParams,
          "v2",
          true,
          { clickhouseSettings: MCP_CLICKHOUSE_SETTINGS },
        );

        return { data: result };
      },
    });
  },
  readOnlyHint: true,
});
