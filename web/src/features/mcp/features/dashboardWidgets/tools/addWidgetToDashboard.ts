import { DashboardService } from "@langfuse/shared/src/server";
import { z } from "zod";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import { defineTool } from "@/src/features/mcp/core/define-tool";
import { runMcpTool } from "@/src/features/mcp/core/run-mcp-tool";
import { buildDashboardUrl } from "@/src/utils/product-url";

const AddWidgetToDashboardSchema = z
  .object({
    dashboardId: z.string().min(1),
    widgetId: z.string().min(1),
  })
  .strict();

export const [addWidgetToDashboardTool, handleAddWidgetToDashboard] =
  defineTool({
    name: "addWidgetToDashboard",
    description:
      "Place an existing reusable widget on a custom dashboard. The widget is added as a 6 by 6 tile below the existing dashboard content.",
    baseSchema: AddWidgetToDashboardSchema,
    inputSchema: AddWidgetToDashboardSchema,
    destructiveHint: true,
    handler: async (input, context) =>
      runMcpTool({
        spanName: "mcp.dashboards.add_widget",
        context,
        attributes: {
          "mcp.dashboard_id": input.dashboardId,
          "mcp.dashboard_widget_id": input.widgetId,
        },
        fn: async () => {
          const { beforeDashboard, updatedDashboard, widget } =
            await DashboardService.addWidgetToDashboard({
              dashboardId: input.dashboardId,
              widgetId: input.widgetId,
              projectId: context.projectId,
              userId: context.userId,
            });

          await auditLog({
            action: "update",
            resourceType: "dashboard",
            resourceId: beforeDashboard.id,
            projectId: context.projectId,
            orgId: context.orgId,
            apiKeyId: context.apiKeyId,
            before: beforeDashboard,
            after: updatedDashboard,
          });

          return {
            dashboardId: updatedDashboard.id,
            widgetId: widget.id,
            url: buildDashboardUrl({
              projectId: context.projectId,
              dashboardId: updatedDashboard.id,
            }),
          };
        },
      }),
  });
