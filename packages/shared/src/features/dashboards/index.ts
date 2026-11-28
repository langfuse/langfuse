import { z } from "zod";

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

export type DashboardDefinition = z.infer<typeof DashboardDefinitionSchema>;

export { compileMultiQueryFormula } from "./multiQueryFormula";
export * from "./multiQuery";
export * from "./widgetDefinition";
