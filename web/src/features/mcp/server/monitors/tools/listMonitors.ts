import {
  ListMonitorsSchema,
  MonitorService,
} from "@langfuse/shared/monitors/server";
import { z } from "zod";

import { buildMonitorUrl } from "@langfuse/shared/src/server";

import { defineTool } from "../../../core/define-tool";
import { McpAdvancedFilterBaseSchema } from "../../../core/filter-schema";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { paginationMeta } from "../../publicApi";

const ListMonitorsSharedSchemaFields = {
  page: ListMonitorsSchema.shape.page,
  limit: ListMonitorsSchema.shape.limit,
};

const ListMonitorsBaseSchema = z.object({
  ...ListMonitorsSharedSchemaFields,
  orderBy: ListMonitorsSchema.shape.orderBy.unwrap().optional(),
  filter: z
    .array(McpAdvancedFilterBaseSchema)
    .optional()
    .describe(
      'Each column at most once: severity (type "stringOptions", operator "any of" | "none of", values PAUSED, UNKNOWN, NO_DATA, OK, WARNING, ALERT), evaluatorId (type "stringOptions", operator "any of" | "none of", ids from listEvaluators), tags (type "arrayOptions", operator "any of" | "all of" | "none of").',
    ),
});

const ListMonitorsInputSchema = ListMonitorsSchema.omit({
  projectId: true,
}).extend({
  orderBy: ListMonitorsSchema.shape.orderBy.default(null),
});

export const [listMonitorsTool, handleListMonitors] = defineTool({
  name: "listAlerts",
  description:
    "List alerts (monitors: a metric query over a time window with warning and alert thresholds, plus current severity and scheduling status), paginated; page 0 behaves like page 1. No MCP tool creates or changes alerts. Use getAlert for one by id.",
  action: "alerts:read",
  baseSchema: ListMonitorsBaseSchema,
  inputSchema: ListMonitorsInputSchema,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.monitors.list",
      context,
      attributes: {
        "mcp.pagination_page": input.page,
        "mcp.pagination_limit": input.limit,
      },
      fn: async (span) => {
        const result = await MonitorService.list(
          { userId: context.userId ?? context.apiKeyId },
          {
            ...input,
            projectId: context.projectId,
          },
        );

        span.setAttribute("mcp.result_count", result.monitors.length);

        return {
          data: result.monitors.map((monitor) => ({
            ...monitor,
            url: buildMonitorUrl({
              projectId: context.projectId,
              monitorId: monitor.id,
            }),
          })),
          meta: paginationMeta({
            page: input.page,
            limit: input.limit,
            totalItems: result.totalCount,
          }),
        };
      },
    }),
  annotations: { readOnlyHint: true },
});
