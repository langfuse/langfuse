import { z } from "zod";
import { singleFilter } from "@langfuse/shared";

const pagination = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

// Public placement shape. Sizes are exposed as width/height in grid cells;
// storage and the UI keep x_size/y_size — the public-dashboard-service maps
// between the two.
const placementPosition = {
  x: z.number().int().gte(0),
  y: z.number().int().gte(0),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
};
export const PublicWidgetPlacementSchema = z
  .object({
    type: z.literal("widget"),
    id: z.string(),
    widgetId: z.string(),
    ...placementPosition,
  })
  .strict();
export const PublicPresetPlacementSchema = z
  .object({
    type: z.literal("preset"),
    id: z.string(),
    presetId: z.string(),
    ...placementPosition,
  })
  .strict();
export const DashboardPlacementSchema = z.discriminatedUnion("type", [
  PublicWidgetPlacementSchema,
  PublicPresetPlacementSchema,
]);
export const PublicDashboardDefinitionSchema = z
  .object({
    widgets: z.array(DashboardPlacementSchema),
  })
  .refine(
    (definition) =>
      new Set(definition.widgets.map((placement) => placement.id)).size ===
      definition.widgets.length,
    "Placement ids must be unique",
  );

export const DashboardSchema = z
  .object({
    id: z.string(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    name: z.string(),
    description: z.string(),
    definition: PublicDashboardDefinitionSchema,
    filters: z.array(singleFilter),
  })
  .strict();

export const GetUnstableDashboardsQuery = pagination;
export const GetUnstableDashboardsResponse = z.object({
  data: z.array(DashboardSchema),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    totalItems: z.number(),
    totalPages: z.number(),
  }),
});

export const PostUnstableDashboardBody = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  definition: PublicDashboardDefinitionSchema.optional(),
  filters: z.array(singleFilter).optional(),
});
export const PostUnstableDashboardResponse = DashboardSchema;

export const DashboardIdQuery = z.object({ dashboardId: z.string() });
export const GetUnstableDashboardResponse = DashboardSchema;
export const PatchUnstableDashboardBody = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    definition: PublicDashboardDefinitionSchema.optional(),
    filters: z.array(singleFilter).optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  );
export const PatchUnstableDashboardResponse = DashboardSchema;
export const DeleteUnstableDashboardResponse = z.object({
  message: z.literal("Dashboard successfully deleted"),
});

export const DashboardPlacementQuery = z.object({
  dashboardId: z.string(),
  placementId: z.string(),
});
// On create, id and grid position are optional: the server generates an id
// and appends the placement below existing tiles with the UI's default size.
const placementCreateOptionalFields = {
  id: true,
  x: true,
  y: true,
  width: true,
  height: true,
} as const;
export const PostDashboardPlacementBody = z.discriminatedUnion("type", [
  PublicWidgetPlacementSchema.partial(placementCreateOptionalFields),
  PublicPresetPlacementSchema.partial(placementCreateOptionalFields),
]);
export const PostDashboardPlacementResponse = DashboardPlacementSchema;
// Placements are moved/resized in place; the widget/preset reference and the
// id are immutable (delete + add to swap content).
export const PatchDashboardPlacementBody = z
  .object(placementPosition)
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  );
export const PatchDashboardPlacementResponse = DashboardPlacementSchema;
export const DeleteDashboardPlacementResponse = z.object({
  message: z.literal("Placement successfully deleted"),
});
