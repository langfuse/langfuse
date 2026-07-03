import { z } from "zod";
import { DashboardWidgetChartType } from "@langfuse/shared";
import { metricAggregations } from "@langfuse/shared/query";
import { defineTool } from "@/src/features/mcp/core/define-tool";
import { runMcpTool } from "@/src/features/mcp/core/run-mcp-tool";
import { createPublicDashboardWidget } from "@/src/features/widgets/server/public-dashboard-widget-service";
import {
  PostUnstableDashboardWidgetBody,
  PostUnstableDashboardWidgetView,
} from "@/src/features/public-api/types/unstable-dashboard-widgets";
import { buildDashboardWidgetUrl } from "@/src/utils/product-url";

const DashboardWidgetFilterBaseSchema = z
  .object({
    column: z.string(),
    operator: z.string(),
    type: z.string(),
    value: z.any().optional(),
    key: z.string().optional(),
  })
  .loose();

const DashboardWidgetChartConfigBaseSchema = z.object({
  type: z.enum(DashboardWidgetChartType),
  row_limit: z.number().int().positive().max(1000).optional(),
  show_value_labels: z.boolean().optional(),
  bins: z.number().int().min(1).max(100).optional(),
  defaultSort: z
    .object({
      column: z.string(),
      order: z.enum(["ASC", "DESC"]),
    })
    .optional(),
});

const CreateDashboardWidgetBaseSchema = z.object({
  name: z.string().min(1).describe("Human-readable widget name."),
  description: z.string().describe("Human-readable widget description."),
  view: PostUnstableDashboardWidgetView.describe(
    "Data view for the widget. Traces widgets are not supported by this unstable API.",
  ),
  dimensions: z
    .array(z.object({ field: z.string().min(1) }))
    .describe(
      "Breakdown dimensions. Non-pivot charts support at most one dimension.",
    ),
  metrics: z
    .array(
      z.object({
        measure: z.string().min(1),
        agg: metricAggregations,
      }),
    )
    .min(1)
    .describe("Measures and aggregations to plot."),
  filters: z
    .array(DashboardWidgetFilterBaseSchema)
    .describe(
      "Widget filters in the same shape as exported dashboard widget JSON.",
    ),
  chartType: z.enum(DashboardWidgetChartType),
  chartConfig: DashboardWidgetChartConfigBaseSchema.describe(
    "Chart-specific config. chartConfig.type must match chartType.",
  ),
  minVersion: z
    .number()
    .int()
    .min(2)
    .optional()
    .describe("Widget data-model version. Defaults to 2."),
});

export const [createDashboardWidgetTool, handleCreateDashboardWidget] =
  defineTool({
    name: "createDashboardWidget",
    description: [
      "Create a reusable dashboard widget.",
      "Widgets are useful to visualize Langfuse project data and give informative breakdowns to the user.",
      "This creates the widget only; placing it on a dashboard requires updating that dashboard's definition in the Langfuse UI.",
      "The result includes a url field; use it to link to the created widget.",
    ].join(" "),
    baseSchema: CreateDashboardWidgetBaseSchema,
    inputSchema: PostUnstableDashboardWidgetBody,
    destructiveHint: true,
    handler: async (input, context) =>
      runMcpTool({
        spanName: "mcp.dashboard_widgets.create",
        context,
        attributes: {
          "mcp.dashboard_widget_name": input.name,
          "mcp.dashboard_widget_view": input.view,
        },
        fn: async (span) => {
          const widget = await createPublicDashboardWidget({
            projectId: context.projectId,
            input,
            auditScope: context,
          });

          span.setAttribute("mcp.dashboard_widget_id", widget.id);

          return {
            ...widget,
            url: buildDashboardWidgetUrl({
              projectId: context.projectId,
              widgetId: widget.id,
            }),
          };
        },
      }),
  });
