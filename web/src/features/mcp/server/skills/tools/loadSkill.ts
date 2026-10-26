import { z } from "zod";
import { SkillNameSchema, SkillSelectorSchema } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { SkillService } from "@/src/features/skills/server";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

const LoadSkillBaseSchema = z.object({
  name: SkillNameSchema,
  ...SkillSelectorSchema.shape,
});

const LoadSkillInputSchema = z
  .object({ name: SkillNameSchema })
  .and(SkillSelectorSchema);

export const [loadSkillTool, handleLoadSkill] = defineTool({
  name: "loadSkill",
  description:
    "Read a skill's SKILL.md as text. Version and label are optional; defaults to production, or latest if no production label is set. Reuse the version returned by getSkill when loading multiple files.",
  action: "skills:read",
  baseSchema: LoadSkillBaseSchema,
  inputSchema: LoadSkillInputSchema,
  handler: async ({ name, ...selector }, context) =>
    runMcpTool({
      spanName: "mcp.skills.load",
      context,
      fn: async () =>
        new SkillService(prisma).loadResource({
          projectId: context.projectId,
          name,
          selector,
          fallbackToLatest: true,
          path: "SKILL.md",
        }),
    }),
  readOnlyHint: true,
});
