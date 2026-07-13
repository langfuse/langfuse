import { randomUUID } from "node:crypto";
import { LangfuseNotFoundError } from "@langfuse/shared";
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
          const [dashboard, widget] = await Promise.all([
            DashboardService.getDashboard(input.dashboardId, context.projectId),
            DashboardService.getWidget(input.widgetId, context.projectId),
          ]);

          if (!dashboard || dashboard.projectId !== context.projectId) {
            throw new LangfuseNotFoundError("Dashboard not found");
          }
          if (!widget) {
            throw new LangfuseNotFoundError("Dashboard widget not found");
          }

          const maxY = dashboard.definition.widgets.reduce(
            (currentMax, placement) =>
              Math.max(currentMax, placement.y + placement.y_size),
            0,
          );
          const definition = {
            widgets: [
              ...dashboard.definition.widgets,
              {
                type: "widget" as const,
                id: randomUUID(),
                widgetId: widget.id,
                x: 0,
                y: maxY,
                x_size: 6,
                y_size: 6,
              },
            ],
          };

          const updatedDashboard =
            await DashboardService.updateDashboardDefinition(
              dashboard.id,
              context.projectId,
              definition,
              context.userId,
            );

          await auditLog({
            action: "update",
            resourceType: "dashboard",
            resourceId: dashboard.id,
            projectId: context.projectId,
            orgId: context.orgId,
            apiKeyId: context.apiKeyId,
            before: dashboard,
            after: updatedDashboard,
          });

          return {
            dashboardId: dashboard.id,
            widgetId: widget.id,
            url: buildDashboardUrl({
              projectId: context.projectId,
              dashboardId: dashboard.id,
            }),
          };
        },
      }),
  });
