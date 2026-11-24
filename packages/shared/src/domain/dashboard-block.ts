import { z } from "zod";
import { multiQueryConfigSchema } from "./dashboard-multi-query";

export const dashboardMarkdownConfigVersion = 1;

export const dashboardMarkdownConfigSchema = z.object({
  version: z
    .literal(dashboardMarkdownConfigVersion)
    .default(dashboardMarkdownConfigVersion),
  title: z.string().max(255),
  content: z.string().max(100_000),
});

export const dashboardBlockContentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("multiQuery"), config: multiQueryConfigSchema }),
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

export type SavedDashboardBlock = z.infer<typeof savedDashboardBlockSchema>;

const dashboardBlockIdentitySchema = z.object({ id: z.uuid() });

export const dashboardBlockPatchSchema = z.union([
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
