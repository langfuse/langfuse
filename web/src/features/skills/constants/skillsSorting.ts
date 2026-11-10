import { z } from "zod/v4";

export const SkillListOrderBySchema = z.object({
  column: z.enum(["name", "latestVersion", "tags", "latestVersionCreatedAt"]),
  order: z.enum(["ASC", "DESC"]),
});

export type SkillListOrderBy = z.infer<typeof SkillListOrderBySchema>;

export const DEFAULT_SKILL_LIST_ORDER_BY = {
  column: "latestVersionCreatedAt",
  order: "DESC",
} satisfies SkillListOrderBy;
