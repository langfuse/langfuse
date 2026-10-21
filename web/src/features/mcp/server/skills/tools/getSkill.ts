import { z } from "zod";
import { SkillNameSchema, SkillSelectorSchema } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { SkillService } from "@/src/features/skills/server";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

const GetSkillBaseSchema = z.object({
  name: SkillNameSchema,
  ...SkillSelectorSchema.shape,
});

const GetSkillInputSchema = z
  .object({ name: SkillNameSchema })
  .and(SkillSelectorSchema);

export const [getSkillTool, handleGetSkill] = defineTool({
  name: "getSkill",
  description:
    "Get skill metadata and file paths, without file contents. Version and label are optional; defaults to production, or latest if no production label is set. Use the returned version with loadSkill and loadSkillResource to read files from the same immutable version.",
  action: "skills:read",
  baseSchema: GetSkillBaseSchema,
  inputSchema: GetSkillInputSchema,
  handler: async ({ name, ...selector }, context) =>
    runMcpTool({
      spanName: "mcp.skills.get",
      context,
      fn: async () =>
        new SkillService(prisma).get({
          projectId: context.projectId,
          name,
          selector,
          fallbackToLatest: true,
        }),
    }),
  readOnlyHint: true,
});
