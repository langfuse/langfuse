import { z } from "zod";
import { HOME_DASHBOARD_PRESET_IDS } from "../../domain/home-dashboard";
import {
  multiQueryConfigV2Schema,
  savedMultiQueryConfigSchema,
} from "./multiQuery";

export const dashboardMarkdownConfigVersion = 1;

export const dashboardMarkdownConfigSchema = z.object({
  version: z
    .literal(dashboardMarkdownConfigVersion)
    .default(dashboardMarkdownConfigVersion),
  title: z.string().max(255),
  content: z.string().max(100_000),
});

export const dashboardBlockContentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("multiQuery"),
    config: savedMultiQueryConfigSchema,
  }),
  z.object({
    kind: z.literal("markdown"),
    config: dashboardMarkdownConfigSchema,
  }),
]);

export const savedDashboardBlockSchema = dashboardBlockContentSchema.and(
  z.object({
    id: z.uuid(),
    revision: z.number().int().positive(),
    beforePlacementId: z.string().nullable(),
  }),
);

const sourcePresetSchema = z.object({
  placementId: z.string().min(1),
  presetId: z.enum(HOME_DASHBOARD_PRESET_IDS),
});

const convertedDashboardPresetSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().positive(),
  kind: z.literal("convertedPreset"),
  sourcePreset: sourcePresetSchema,
  config: multiQueryConfigV2Schema,
  beforePlacementId: z.null(),
});

export const storedInlineDashboardWidgetSchema = z.union([
  savedDashboardBlockSchema,
  convertedDashboardPresetSchema,
]);
export type StoredInlineDashboardWidget = z.infer<
  typeof storedInlineDashboardWidgetSchema
>;

export type SavedDashboardBlock = z.infer<typeof savedDashboardBlockSchema> & {
  sourcePreset?: z.infer<typeof sourcePresetSchema>;
};

const dashboardBlockIdentitySchema = z.object({ id: z.uuid() });

export const dashboardBlockPatchSchema = z.union([
  dashboardBlockIdentitySchema.extend({
    op: z.literal("convertPreset"),
    expectedRevision: z.literal(0),
    sourcePreset: sourcePresetSchema,
    config: multiQueryConfigV2Schema,
  }),
  dashboardBlockIdentitySchema.extend({
    op: z.literal("restorePreset"),
    expectedRevision: z.number().int().positive(),
  }),
  dashboardBlockIdentitySchema
    .extend({
      op: z.literal("upsert"),
      expectedRevision: z.number().int().nonnegative(),
      beforePlacementId: z.string().nullable().optional(),
    })
    .and(dashboardBlockContentSchema),
  dashboardBlockIdentitySchema.extend({
    op: z.literal("remove"),
    expectedRevision: z.number().int().positive(),
  }),
]);

export type DashboardBlockPatch = z.infer<typeof dashboardBlockPatchSchema>;
