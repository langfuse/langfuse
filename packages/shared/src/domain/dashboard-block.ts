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
