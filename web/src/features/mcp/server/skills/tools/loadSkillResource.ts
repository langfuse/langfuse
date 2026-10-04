import { z } from "zod";
import {
  SkillFilePathSchema,
  SkillNameSchema,
  SkillSelectorSchema,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { SkillService } from "@/src/features/skills/server";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

const LoadSkillResourceBaseSchema = z.object({
  name: SkillNameSchema,
  path: SkillFilePathSchema,
  ...SkillSelectorSchema.shape,
});

const LoadSkillResourceInputSchema = z
  .object({ name: SkillNameSchema, path: SkillFilePathSchema })
  .and(SkillSelectorSchema);

export const [loadSkillResourceTool, handleLoadSkillResource] = defineTool({
  name: "loadSkillResource",
  description:
    "Read a skill file as text by path (see getSkill). Select a version or label; defaults to production.",
  action: "skills:read",
  baseSchema: LoadSkillResourceBaseSchema,
  inputSchema: LoadSkillResourceInputSchema,
  handler: async ({ name, path, ...selector }, context) =>
    runMcpTool({
      spanName: "mcp.skills.loadResource",
      context,
      fn: async () =>
        new SkillService(prisma).loadResource({
          projectId: context.projectId,
          name,
          selector,
          path,
        }),
    }),
  readOnlyHint: true,
});
