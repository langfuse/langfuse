import { z } from "zod";
import { singleFilter } from "@langfuse/shared";
import {
  DashboardDefinitionSchema,
  DashboardDefinitionPresetWidgetSchema,
  DashboardDefinitionWidgetSchema,
  DashboardDefinitionWidgetWidgetSchema,
} from "@langfuse/shared/src/server";

const pagination = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export const DashboardPlacementSchema = DashboardDefinitionWidgetSchema;

export const DashboardSchema = z
  .object({
    id: z.string(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    name: z.string(),
    description: z.string(),
    definition: DashboardDefinitionSchema,
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
  definition: DashboardDefinitionSchema.optional(),
  filters: z.array(singleFilter).optional(),
});
export const PostUnstableDashboardResponse = DashboardSchema;

export const DashboardIdQuery = z.object({ dashboardId: z.string() });
export const GetUnstableDashboardResponse = DashboardSchema;
export const PatchUnstableDashboardBody = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    definition: DashboardDefinitionSchema.optional(),
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
  x_size: true,
  y_size: true,
} as const;
export const PostDashboardPlacementBody = z.discriminatedUnion("type", [
  DashboardDefinitionWidgetWidgetSchema.partial(placementCreateOptionalFields),
  DashboardDefinitionPresetWidgetSchema.partial(placementCreateOptionalFields),
]);
export const PatchDashboardPlacementBody = DashboardPlacementSchema;
export const PostDashboardPlacementResponse = DashboardSchema.extend({
  placementId: z.string(),
});
export const DashboardPlacementResponse = DashboardSchema;
export const DeleteDashboardPlacementResponse = DashboardSchema;
