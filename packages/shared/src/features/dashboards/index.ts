import { z } from "zod";
import { savedDashboardBlockSchema } from "./blocks";

export const DashboardDefinitionWidgetWidgetSchema = z.object({
  type: z.literal("widget"),
  id: z.string(),
  widgetId: z.string(),
  x: z.number().int().gte(0),
  y: z.number().int().gte(0),
  x_size: z.number().int().positive(),
  y_size: z.number().int().positive(),
});

// A preset placement identifies a curated component in the web preset registry.
export const DashboardDefinitionPresetWidgetSchema = z.object({
  type: z.literal("preset"),
  id: z.string(),
  presetId: z.string(),
  x: z.number().int().gte(0),
  y: z.number().int().gte(0),
  x_size: z.number().int().positive(),
  y_size: z.number().int().positive(),
});

export const DashboardDefinitionWidgetSchema = z.discriminatedUnion("type", [
  DashboardDefinitionWidgetWidgetSchema,
  DashboardDefinitionPresetWidgetSchema,
]);

export const DashboardDefinitionSchema = z.object({
  widgets: z.array(DashboardDefinitionWidgetSchema),
});

/** Version 1 mirrors classic placements in widgets; blocks carries the complete layout. */
export const DashboardDefinitionV1Schema = DashboardDefinitionSchema.extend({
  version: z.literal("1"),
  blocks: z.array(
    z.union([DashboardDefinitionWidgetSchema, savedDashboardBlockSchema]),
  ),
});

export type DashboardDefinition = z.infer<typeof DashboardDefinitionSchema>;

export * from "./blocks";
export * from "./multiQuery";
