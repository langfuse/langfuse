import { z } from "zod";
import {
  COMMIT_MESSAGE_MAX_LENGTH,
  CreateSkillVersionBodySchema,
  MAX_SKILL_FILES,
  SkillFilePathSchema,
  SkillVersionFileInputSchema,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { SkillService } from "@/src/features/skills/server";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

const CreateSkillVersionBaseSchema = z.object({
  files: z
    .array(
      z.object({
        path: SkillFilePathSchema,
        content: z.string().describe("Full UTF-8 text content of the file"),
      }),
    )
    .min(1)
    .max(MAX_SKILL_FILES)
    .describe(
      "Complete set of files for this version, including a root SKILL.md with YAML name and description frontmatter. Maximum 1 MB of text in total.",
    ),
  commitMessage: z
    .string()
    .max(COMMIT_MESSAGE_MAX_LENGTH)
    .optional()
    .describe("Optional description of the changes"),
});

export const [createSkillVersionTool, handleCreateSkillVersion] = defineTool({
  name: "createSkillVersion",
  description: [
    "Create a skill or a new immutable version of an existing skill in the current project.",
    "Provide all files as inline text, including SKILL.md with YAML frontmatter containing name and description.",
    "The name identifies the skill; using an existing name creates its next version. Omitted files are absent from the new version, while earlier versions remain unchanged.",
    "New versions receive the latest label; this does not promote them to production or install them into Halo's own instructions.",
  ].join(" "),
  action: "skills:CUD",
  baseSchema: CreateSkillVersionBaseSchema,
  inputSchema: CreateSkillVersionBodySchema.safeExtend({
    files: z.array(SkillVersionFileInputSchema).min(1).max(MAX_SKILL_FILES),
  }),
  handler: (input, context) =>
    runMcpTool({
      spanName: "mcp.skills.createVersion",
      context,
      fn: async () =>
        new SkillService(prisma).createVersion({
          projectId: context.projectId,
          createdBy: context.userId ?? "API",
          input,
          actor: {
            apiKeyId: context.apiKeyId,
            orgId: context.orgId,
            projectId: context.projectId,
            accessLevel: context.accessLevel,
            ctx: context.auth,
          },
        }),
    }),
  destructiveHint: true,
});
