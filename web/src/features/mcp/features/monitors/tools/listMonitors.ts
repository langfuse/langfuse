import {
  ListMonitorsSchema,
  MonitorService,
} from "@langfuse/shared/monitors/server";
import { z } from "zod";

import { buildMonitorUrl } from "@/src/utils/product-url";

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
    .describe("Filter monitors by severity or tags."),
});

const ListMonitorsInputSchema = ListMonitorsSchema.omit({
  projectId: true,
}).extend({
  orderBy: ListMonitorsSchema.shape.orderBy.default(null),
});

export const [listMonitorsTool, handleListMonitors] = defineTool({
  name: "listMonitors",
  description:
    "List monitors, optionally filtered by severity or tags and ordered by monitor properties.",
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
  readOnlyHint: true,
});
