import { StringNoHTML } from "@langfuse/shared";
import { DashboardService } from "@langfuse/shared/src/server";
import { z } from "zod";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import { defineTool } from "@/src/features/mcp/core/define-tool";
import { runMcpTool } from "@/src/features/mcp/core/run-mcp-tool";
import { buildDashboardUrl } from "@/src/utils/product-url";

const CreateDashboardSchema = z
  .object({
    name: StringNoHTML.trim().min(1).max(200),
    description: StringNoHTML.max(2000).default(""),
  })
  .strict();

export const [createDashboardTool, handleCreateDashboard] = defineTool({
  name: "createDashboard",
  description:
    "Create an empty custom dashboard in the current Langfuse project. Use createDashboardWidget and addWidgetToDashboard to populate it.",
  baseSchema: CreateDashboardSchema,
  inputSchema: CreateDashboardSchema,
  destructiveHint: true,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.dashboards.create",
      context,
      attributes: { "mcp.dashboard_name": input.name },
      fn: async (span) => {
        const dashboard = await DashboardService.createDashboard(
          context.projectId,
          input.name,
          input.description,
          context.userId,
        );

        span.setAttribute("mcp.dashboard_id", dashboard.id);

        await auditLog({
          action: "create",
          resourceType: "dashboard",
          resourceId: dashboard.id,
          projectId: context.projectId,
          orgId: context.orgId,
          apiKeyId: context.apiKeyId,
          after: dashboard,
        });

        return {
          ...dashboard,
          url: buildDashboardUrl({
            projectId: context.projectId,
            dashboardId: dashboard.id,
          }),
        };
      },
    }),
});
