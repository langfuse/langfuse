import { z } from "zod";
import { defineTool } from "@/src/features/mcp/core/define-tool";
import { runMcpTool } from "@/src/features/mcp/core/run-mcp-tool";
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
const placementBaseSchema = z.object({
  type: z.enum(["widget", "preset"]),
  id: z.string(),
  widgetId: z.string().optional(),
  presetId: z.string().optional(),
  x: z.number().int().gte(0),
  y: z.number().int().gte(0),
  x_size: z.number().int().positive(),
  y_size: z.number().int().positive(),
});
// On add, id and position are optional: the service generates an id and
// appends below existing tiles with the UI's default 6x6 size.
const placementCreateBaseSchema = placementBaseSchema.partial({
  id: true,
  x: true,
  y: true,
  x_size: true,
  y_size: true,
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
    .array(z.object({ measure: z.string(), agg: z.string() }))
    .optional(),
  filters: z.array(z.object({}).loose()).optional(),
  chartType: z.string().optional(),
  chartConfig: z.object({ type: z.string() }).loose().optional(),
  minVersion: z.number().int().min(2).optional(),
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
// Extract the placement fields from an MCP input (which also carries
// dashboardId/placementId). Two variants because coordinate optionality
// differs: updates require the complete placement, creates may omit
// id/position and let the service fill defaults.
const toPlacement = (placement: z.infer<typeof placementBaseSchema>) =>
  placement.type === "widget"
    ? {
        type: "widget" as const,
        id: placement.id,
        widgetId: placement.widgetId!,
        x: placement.x,
        y: placement.y,
        x_size: placement.x_size,
        y_size: placement.y_size,
      }
    : {
        type: "preset" as const,
        id: placement.id,
        presetId: placement.presetId!,
        x: placement.x,
        y: placement.y,
        x_size: placement.x_size,
        y_size: placement.y_size,
      };
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
        x_size: placement.x_size,
        y_size: placement.y_size,
      }
    : {
        type: "preset" as const,
        id: placement.id,
        presetId: placement.presetId!,
        x: placement.x,
        y: placement.y,
        x_size: placement.x_size,
        y_size: placement.y_size,
      };

export const [listDashboardWidgetsTool, handleListDashboardWidgets] =
  defineTool({
    name: "listDashboardWidgets",
    description: "List reusable dashboard widgets in the current project.",
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
  description: "Get a reusable dashboard widget by ID.",
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
    description: "Partially update a reusable dashboard widget.",
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
      "Delete a reusable dashboard widget. It must first be removed from every dashboard placement.",
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
    "coordinates (x/y top-left cell, x_size/y_size in cells).",
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
      "appends the tile below existing ones at the default 6x6 size, so no " +
      "layout reasoning is needed. Explicit positions are not checked for " +
      "overlap. The response includes the resulting placementId.",
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
      "Move or resize an existing dashboard placement. Requires the " +
      "complete placement (12-column grid, x/y top-left cell, sizes in " +
      "cells); the placement id cannot change. Use getDashboard to read " +
      "the current layout first. Overlaps are not checked.",
    baseSchema: placementQuery.extend(placementBaseSchema.shape),
    inputSchema: placementQuery
      .extend(placementBaseSchema.shape)
      .superRefine(requirePlacementIds),
    destructiveHint: true,
    handler: (input, context) =>
      runMcpTool({
        spanName: "mcp.dashboards.placements.update",
        context,
        fn: () =>
          updatePublicDashboardPlacement({
            projectId: context.projectId,
            dashboardId: input.dashboardId,
            placementId: input.placementId,
            placement: toPlacement(input),
            auditScope: auditScope(context),
          }),
      }),
  });
export const [deleteDashboardPlacementTool, handleDeleteDashboardPlacement] =
  defineTool({
    name: "deleteDashboardPlacement",
    description:
      "Remove a placement from a dashboard without deleting its reusable widget.",
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
