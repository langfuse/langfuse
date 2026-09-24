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
  description: [
    "Load a text-like file from a skill version as UTF-8 text. Use getSkill to discover file paths and content types.",
    "Specify name, the file's relative path, and either version or label, not both. Defaults to the 'production' label; use label 'latest' for the newest version.",
    "Supports text MIME types and common structured-text types such as JSON, XML, YAML, TOML, and JavaScript. Binary or unknown content types are rejected before downloading bytes.",
    "Use loadSkill to read the root SKILL.md instructions directly.",
  ].join("\n"),
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
