import { z } from "zod";
import isEqual from "lodash/isEqual";
import {
  storedInlineDashboardWidgetSchema,
  singleFilterList,
} from "@langfuse/shared";

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
const PublicWidgetPlacementSchema = z
  .object({
    type: z.literal("widget"),
    id: z.string(),
    widgetId: z.string(),
    ...placementPosition,
  })
  .strict();
const PublicPresetPlacementSchema = z
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
const classicWidgets = z.array(DashboardPlacementSchema).meta({
  deprecated: true,
  description:
    "Use blocks in a version 1 dashboard definition. The widgets list mirrors its classic placements.",
});
const legacyDefinition = z
  .strictObject({ widgets: classicWidgets })
  .refine(
    (definition) =>
      new Set(definition.widgets.map((placement) => placement.id)).size ===
      definition.widgets.length,
    "Placement ids must be unique",
  );

const versionedDefinition = z.strictObject({
  version: z.literal("1"),
  blocks: z.array(
    z.union([DashboardPlacementSchema, storedInlineDashboardWidgetSchema]),
  ),
  widgets: classicWidgets,
});
const writableVersionedDefinition = versionedDefinition.partial({
  widgets: true,
});
function validateVersionedLayout(
  { blocks, widgets }: z.infer<typeof writableVersionedDefinition>,
  ctx: z.RefinementCtx,
) {
  if (new Set(blocks.map((block) => block.id)).size !== blocks.length) {
    ctx.addIssue({
      code: "custom",
      path: ["blocks"],
      message: "Widget and placement IDs must be unique",
    });
  }
  if (
    widgets &&
    !isEqual(
      widgets,
      blocks.filter((block) => "type" in block),
    )
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["widgets"],
      message: "Widgets must match the classic placements in blocks, in order",
    });
  }
}
const dashboardDefinitionInput = z.union([
  writableVersionedDefinition.superRefine(validateVersionedLayout),
  // Classic clients may include their own metadata. A version or blocks field
  // identifies a versioned document and must never fall back to a classic write.
  z.preprocess((input) => {
    if (
      input !== null &&
      typeof input === "object" &&
      "widgets" in input &&
      !("version" in input) &&
      !("blocks" in input)
    )
      return { widgets: input.widgets };
    return input;
  }, legacyDefinition),
]);

export const DashboardSchema = z
  .object({
    id: z.string(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    name: z.string(),
    description: z.string(),
    definition: z.union([
      versionedDefinition.superRefine(validateVersionedLayout),
      legacyDefinition,
    ]),
    filters: singleFilterList,
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
  definition: dashboardDefinitionInput.optional(),
  filters: singleFilterList.optional(),
});
/** @alias */
export const PostUnstableDashboardResponse = DashboardSchema;

export const DashboardIdQuery = z.object({ dashboardId: z.string() });
/** @alias */
export const GetUnstableDashboardResponse = DashboardSchema;
export const PatchUnstableDashboardBody = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    definition: dashboardDefinitionInput.optional(),
    filters: singleFilterList.optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  );
/** @alias */
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
/** @alias */
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
/** @alias */
export const PatchDashboardPlacementResponse = DashboardPlacementSchema;
export const DeleteDashboardPlacementResponse = z.object({
  message: z.literal("Placement successfully deleted"),
});
