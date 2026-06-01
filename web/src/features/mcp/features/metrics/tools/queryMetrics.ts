import { InvalidRequestError } from "@langfuse/shared";
import { executeQuery } from "@langfuse/shared/query/server";
import {
  dimension,
  granularities,
  metric,
  validateQuery,
  viewsV2,
} from "@langfuse/shared/query";
import { MetricsQueryObjectV2 } from "@/src/features/public-api/types/metrics";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { z } from "zod";

const DEFAULT_ROW_LIMIT = 100;

const normalizeMetricOrderByFields = (
  input: z.infer<typeof MetricsQueryObjectV2>,
) => {
  if (!input.orderBy) {
    return input;
  }

  const metricAliases = input.metrics.map(
    (metric) => `${metric.aggregation}_${metric.measure}`,
  );
  const allowedOrderByFields = new Set([
    ...input.dimensions.map((dimension) => dimension.field),
    ...metricAliases,
    ...(input.timeDimension ? ["time_dimension"] : []),
  ]);

  return {
    ...input,
    orderBy: input.orderBy.map((orderBy) => {
      const matchingMetrics = input.dimensions.some(
        (dimension) => dimension.field === orderBy.field,
      )
        ? []
        : input.metrics.filter((metric) => metric.measure === orderBy.field);
      const normalizedField =
        matchingMetrics.length === 1
          ? `${matchingMetrics[0].aggregation}_${matchingMetrics[0].measure}`
          : orderBy.field;

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

const MetricsFilterBaseSchema = z.object({
  column: z.string(),
  operator: z.string(),
  value: z.any(),
  type: z.string(),
  key: z.string().optional(),
});

const MetricsQueryObjectV2BaseSchema = z.object({
  view: viewsV2,
  dimensions: z.array(dimension).optional().default([]),
  metrics: z.array(metric),
  filters: z.array(MetricsFilterBaseSchema).optional().default([]),
  timeDimension: z
    .object({
      granularity: granularities,
    })
    .optional(),
  fromTimestamp: z.iso.datetime({ offset: true }),
  toTimestamp: z.iso.datetime({ offset: true }),
  orderBy: z
    .array(
      z.object({
        field: z.string(),
        direction: z.enum(["asc", "desc"]),
      }),
    )
    .optional(),
  config: z
    .object({
      bins: z.number().int().min(1).max(100).optional(),
      row_limit: z.number().int().positive().lte(1000).optional(),
    })
    .optional(),
});

export const [queryMetricsTool, handleQueryMetrics] = defineTool({
  name: "queryMetrics",
  description:
    "Answer analytics questions about the current Langfuse project, such as usage over time, model costs, latency, errors, scores, or grouped breakdowns by environment, trace, observation, model, user, session, tag, or score name.",
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
        const normalizedInput = normalizeMetricOrderByFields(input);
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
        );

        return { data: result };
      },
    });
  },
  readOnlyHint: true,
});
