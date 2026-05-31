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
        const validation = validateQuery(input, "v2");

        if (!validation.valid) {
          throw new InvalidRequestError(validation.reason);
        }

        const { config, ...query } = input;
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
