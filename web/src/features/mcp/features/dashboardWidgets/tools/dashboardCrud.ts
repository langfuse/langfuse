import { z } from "zod";
import { DashboardWidgetChartType } from "@langfuse/shared";
import { metricAggregations } from "@langfuse/shared/query";
import { defineTool } from "@/src/features/mcp/core/define-tool";
import { runMcpTool } from "@/src/features/mcp/core/run-mcp-tool";
import {
  DashboardWidgetChartConfigBaseSchema,
  DashboardWidgetFilterBaseSchema,
} from "@/src/features/mcp/features/dashboardWidgets/tools/createDashboardWidget";
import {
  buildDashboardUrl,
  buildDashboardWidgetUrl,
} from "@/src/utils/product-url";
import {
  GetUnstableDashboardWidgetsQuery,
  DashboardWidgetIdQuery,
  PatchUnstableDashboardWidgetBody,
} from "@/src/features/public-api/types/unstable-dashboard-widgets";
import {
  deletePublicDashboardWidget,
  getPublicDashboardWidget,
  listPublicDashboardWidgets,
  updatePublicDashboardWidget,
} from "@/src/features/widgets/server/public-dashboard-widget-service";
import {
  DashboardIdQuery,
  GetUnstableDashboardsQuery,
  PatchUnstableDashboardBody,
  PostUnstableDashboardBody,
} from "@/src/features/public-api/types/unstable-dashboards";
import {
  addPublicDashboardPlacement,
  createPublicDashboard,
  deletePublicDashboard,
  deletePublicDashboardPlacement,
  getPublicDashboard,
  listPublicDashboards,
  updatePublicDashboard,
  updatePublicDashboardPlacement,
} from "@/src/features/dashboard/server/public-dashboard-service";

const auditScope = (context: { orgId: string; apiKeyId: string }) => ({
  orgId: context.orgId,
  apiKeyId: context.apiKeyId,
});
// On add, id and position are optional: the service generates an id and
// appends below existing tiles with the UI's default 6x6 size.
const placementCreateBaseSchema = z.object({
  type: z.enum(["widget", "preset"]),
  id: z.string().optional(),
  widgetId: z.string().optional(),
  presetId: z.string().optional(),
  x: z.number().int().gte(0).optional(),
  y: z.number().int().gte(0).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
// Placements are moved/resized in place; content and id are immutable.
const placementPatchBaseSchema = z.object({
  x: z.number().int().gte(0).optional(),
  y: z.number().int().gte(0).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
const dashboardWidgetPatchBaseSchema = z.object({
  widgetId: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  view: z
    .enum(["observations", "scores-numeric", "scores-categorical"])
    .optional(),
  dimensions: z.array(z.object({ field: z.string() })).optional(),
  metrics: z
    .array(z.object({ measure: z.string(), agg: metricAggregations }))
    .optional(),
  filters: z.array(DashboardWidgetFilterBaseSchema).optional(),
  chartType: z.enum(DashboardWidgetChartType).optional(),
  chartConfig: DashboardWidgetChartConfigBaseSchema.optional(),
});
const dashboardPatchBaseSchema = z.object({
  dashboardId: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  filters: z.array(z.object({}).loose()).optional(),
  definition: z.object({ widgets: z.array(z.object({}).loose()) }).optional(),
});
const dashboardCreateBaseSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  filters: z.array(z.object({}).loose()).optional(),
  definition: z.object({ widgets: z.array(z.object({}).loose()) }).optional(),
});
// NOTE: object-level refinements do not survive `.shape` spreads, so every
// schema built via `.extend(x.shape)` below must re-apply them explicitly.
const requirePlacementIds = (
  placement: z.infer<typeof placementCreateBaseSchema>,
  ctx: z.RefinementCtx,
) => {
  if (placement.type === "widget" && !placement.widgetId)
    ctx.addIssue({
      code: "custom",
      path: ["widgetId"],
      message: "widgetId is required for widget placements",
    });
  if (placement.type === "preset" && !placement.presetId)
    ctx.addIssue({
      code: "custom",
      path: ["presetId"],
      message: "presetId is required for preset placements",
    });
};
const requirePatchField =
  (idKeys: string[]) =>
  (value: Record<string, unknown>, ctx: z.RefinementCtx) => {
    const patchKeys = Object.keys(value).filter(
      (key) => !idKeys.includes(key) && value[key] !== undefined,
    );
    if (patchKeys.length === 0)
      ctx.addIssue({
        code: "custom",
        message: "At least one field is required",
      });
  };
// Extract the placement fields from an MCP add-placement input (which also
// carries dashboardId).
const toPlacementCreate = (
  placement: z.infer<typeof placementCreateBaseSchema>,
) =>
  placement.type === "widget"
    ? {
        type: "widget" as const,
        id: placement.id,
        widgetId: placement.widgetId!,
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
      }
    : {
        type: "preset" as const,
        id: placement.id,
        presetId: placement.presetId!,
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
      };

export const [listDashboardWidgetsTool, handleListDashboardWidgets] =
  defineTool({
    name: "listDashboardWidgets",
    description: "List dashboard widgets in the current project.",
    baseSchema: GetUnstableDashboardWidgetsQuery,
    inputSchema: GetUnstableDashboardWidgetsQuery,
    readOnlyHint: true,
    handler: (input, context) =>
      runMcpTool({
        spanName: "mcp.dashboard_widgets.list",
        context,
        fn: async () => {
          const result = await listPublicDashboardWidgets({
            projectId: context.projectId,
            ...input,
          });
          return {
            ...result,
            data: result.data.map((widget) => ({
              ...widget,
              url: buildDashboardWidgetUrl({
                projectId: context.projectId,
                widgetId: widget.id,
              }),
            })),
          };
        },
      }),
  });
export const [getDashboardWidgetTool, handleGetDashboardWidget] = defineTool({
  name: "getDashboardWidget",
  description: "Get a dashboard widget by ID.",
  baseSchema: DashboardWidgetIdQuery,
  inputSchema: DashboardWidgetIdQuery,
  readOnlyHint: true,
  handler: (input, context) =>
    runMcpTool({
      spanName: "mcp.dashboard_widgets.get",
      context,
      fn: async () => ({
        ...(await getPublicDashboardWidget({
          projectId: context.projectId,
          widgetId: input.widgetId,
        })),
        url: buildDashboardWidgetUrl({
          projectId: context.projectId,
          widgetId: input.widgetId,
        }),
      }),
    }),
});
export const [updateDashboardWidgetTool, handleUpdateDashboardWidget] =
  defineTool({
    name: "updateDashboardWidget",
    description: "Partially update a dashboard widget.",
    baseSchema: dashboardWidgetPatchBaseSchema,
    inputSchema: DashboardWidgetIdQuery.extend(
      PatchUnstableDashboardWidgetBody.shape,
    ).superRefine(requirePatchField(["widgetId"])),
    destructiveHint: true,
    handler: ({ widgetId, ...patch }, context) =>
      runMcpTool({
        spanName: "mcp.dashboard_widgets.update",
        context,
        fn: async () =>
          updatePublicDashboardWidget({
            projectId: context.projectId,
            widgetId,
            input: patch,
            auditScope: auditScope(context),
          }),
      }),
  });
export const [deleteDashboardWidgetTool, handleDeleteDashboardWidget] =
  defineTool({
    name: "deleteDashboardWidget",
    description:
      "Delete a dashboard widget. It must first be removed from every dashboard placement.",
    baseSchema: DashboardWidgetIdQuery,
    inputSchema: DashboardWidgetIdQuery,
    destructiveHint: true,
    handler: (input, context) =>
      runMcpTool({
        spanName: "mcp.dashboard_widgets.delete",
        context,
        fn: async () => {
          await deletePublicDashboardWidget({
            projectId: context.projectId,
            widgetId: input.widgetId,
            auditScope: auditScope(context),
          });
          return { message: "Dashboard widget successfully deleted" };
        },
      }),
  });

export const [listDashboardsTool, handleListDashboards] = defineTool({
  name: "listDashboards",
  description: "List editable dashboards in the current project.",
  baseSchema: GetUnstableDashboardsQuery,
  inputSchema: GetUnstableDashboardsQuery,
  readOnlyHint: true,
  handler: (input, context) =>
    runMcpTool({
      spanName: "mcp.dashboards.list",
      context,
      fn: async () => {
        const result = await listPublicDashboards({
          projectId: context.projectId,
          ...input,
        });
        return {
          ...result,
          data: result.data.map((dashboard) => ({
            ...dashboard,
            url: buildDashboardUrl({
              projectId: context.projectId,
              dashboardId: dashboard.id,
            }),
          })),
        };
      },
    }),
});
export const [getDashboardTool, handleGetDashboard] = defineTool({
  name: "getDashboard",
  description:
    "Get an editable dashboard by ID, including its current layout: " +
    "definition.widgets lists every placement with 12-column-grid " +
    "coordinates (x/y top-left cell, width/height in cells).",
  baseSchema: DashboardIdQuery,
  inputSchema: DashboardIdQuery,
  readOnlyHint: true,
  handler: (input, context) =>
    runMcpTool({
      spanName: "mcp.dashboards.get",
      context,
      fn: async () => ({
        ...(await getPublicDashboard({
          projectId: context.projectId,
          dashboardId: input.dashboardId,
        })),
        url: buildDashboardUrl({
          projectId: context.projectId,
          dashboardId: input.dashboardId,
        }),
      }),
    }),
});
export const [createDashboardTool, handleCreateDashboard] = defineTool({
  name: "createDashboard",
  description: "Create an editable dashboard.",
  baseSchema: dashboardCreateBaseSchema,
  inputSchema: PostUnstableDashboardBody,
  destructiveHint: true,
  handler: (input, context) =>
    runMcpTool({
      spanName: "mcp.dashboards.create",
      context,
      fn: () =>
        createPublicDashboard({
          projectId: context.projectId,
          input,
          auditScope: auditScope(context),
        }),
    }),
});
export const [updateDashboardTool, handleUpdateDashboard] = defineTool({
  name: "updateDashboard",
  description:
    "Partially update dashboard metadata, filters, or its complete definition.",
  baseSchema: dashboardPatchBaseSchema,
  inputSchema: DashboardIdQuery.extend(
    PatchUnstableDashboardBody.shape,
  ).superRefine(requirePatchField(["dashboardId"])),
  destructiveHint: true,
  handler: ({ dashboardId, ...patch }, context) =>
    runMcpTool({
      spanName: "mcp.dashboards.update",
      context,
      fn: () =>
        updatePublicDashboard({
          projectId: context.projectId,
          dashboardId,
          input: patch,
          auditScope: auditScope(context),
        }),
    }),
});
export const [deleteDashboardTool, handleDeleteDashboard] = defineTool({
  name: "deleteDashboard",
  description: "Delete an editable dashboard.",
  baseSchema: DashboardIdQuery,
  inputSchema: DashboardIdQuery,
  destructiveHint: true,
  handler: (input, context) =>
    runMcpTool({
      spanName: "mcp.dashboards.delete",
      context,
      fn: async () => {
        await deletePublicDashboard({
          projectId: context.projectId,
          dashboardId: input.dashboardId,
          auditScope: auditScope(context),
        });
        return { message: "Dashboard successfully deleted" };
      },
    }),
});

const placementQuery = DashboardIdQuery.extend({ placementId: z.string() });
export const [addDashboardPlacementTool, handleAddDashboardPlacement] =
  defineTool({
    name: "addDashboardPlacement",
    description:
      "Add a widget or preset placement to a dashboard's 12-column grid. " +
      "Prefer omitting id and position: the server generates an id and " +
      "appends the tile below existing ones at the default 6x6 size. Explicit " +
      "positions are not checked for overlap. After adding, call getDashboard " +
      "to verify the full grid arrangement; use updateDashboardPlacement to " +
      "move or resize the new tile when needed. Returns the created placement. " +
      "If the user has the dashboard open, remind them to refresh the page to " +
      "see the new widget.",
    baseSchema: DashboardIdQuery.extend(placementCreateBaseSchema.shape),
    inputSchema: DashboardIdQuery.extend(
      placementCreateBaseSchema.shape,
    ).superRefine(requirePlacementIds),
    destructiveHint: true,
    handler: (input, context) =>
      runMcpTool({
        spanName: "mcp.dashboards.placements.add",
        context,
        fn: () =>
          addPublicDashboardPlacement({
            projectId: context.projectId,
            dashboardId: input.dashboardId,
            placement: toPlacementCreate(input),
            auditScope: auditScope(context),
          }),
      }),
  });
export const [updateDashboardPlacementTool, handleUpdateDashboardPlacement] =
  defineTool({
    name: "updateDashboardPlacement",
    description:
      "Move or resize an existing dashboard placement on the 12-column " +
      "grid. Pass any of x, y (top-left cell), width, height (in cells); " +
      "omitted fields keep their current value. The placement's content " +
      "and id cannot change. Use getDashboard to read the current layout " +
      "first. Overlaps are not checked. Returns the updated placement.",
    baseSchema: placementQuery.extend(placementPatchBaseSchema.shape),
    inputSchema: placementQuery
      .extend(placementPatchBaseSchema.shape)
      .superRefine(requirePatchField(["dashboardId", "placementId"])),
    destructiveHint: true,
    handler: ({ dashboardId, placementId, ...patch }, context) =>
      runMcpTool({
        spanName: "mcp.dashboards.placements.update",
        context,
        fn: () =>
          updatePublicDashboardPlacement({
            projectId: context.projectId,
            dashboardId,
            placementId,
            placement: patch,
            auditScope: auditScope(context),
          }),
      }),
  });
export const [deleteDashboardPlacementTool, handleDeleteDashboardPlacement] =
  defineTool({
    name: "deleteDashboardPlacement",
    description:
      "Remove a placement from a dashboard without deleting the underlying widget.",
    baseSchema: placementQuery,
    inputSchema: placementQuery,
    destructiveHint: true,
    handler: (input, context) =>
      runMcpTool({
        spanName: "mcp.dashboards.placements.delete",
        context,
        fn: () =>
          deletePublicDashboardPlacement({
            projectId: context.projectId,
            dashboardId: input.dashboardId,
            placementId: input.placementId,
            auditScope: auditScope(context),
          }),
      }),
  });
