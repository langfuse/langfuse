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
  description: [
    "Load a skill's SKILL.md file as Markdown text, including its frontmatter and instructions.",
    "Specify name and either version or label, not both. Defaults to the 'production' label; use label 'latest' for the newest version.",
    "Returns only SKILL.md, without other files or download URLs.",
  ].join("\n"),
  action: "skills:read",
  baseSchema: LoadSkillBaseSchema,
  inputSchema: LoadSkillInputSchema,
  handler: async ({ name, ...selector }, context) =>
    runMcpTool({
      spanName: "mcp.skills.load",
      context,
      fn: async () =>
        new SkillService(prisma).load({
          projectId: context.projectId,
          name,
          selector,
        }),
    }),
  readOnlyHint: true,
});
