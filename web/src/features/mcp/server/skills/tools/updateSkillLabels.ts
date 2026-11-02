import { z } from "zod";
import { SkillNameSchema, UpdateSkillLabelsBodySchema } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { SkillService } from "@/src/features/skills/server";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

const UpdateSkillLabelsSchema = UpdateSkillLabelsBodySchema.extend({
  name: SkillNameSchema,
  version: z.number().int().positive(),
});

export const [updateSkillLabelsTool, handleUpdateSkillLabels] = defineTool({
  name: "updateSkillLabels",
  description: [
    "Replace the user-managed labels on a specific skill version in the current project.",
    "Include every label to retain; an empty labels array removes all user-managed labels from that version.",
    "Labels are unique across versions of a skill: assigning a label moves it from any other version.",
    "The latest label is automatically managed, is preserved, and must not be supplied.",
    "Only assign the production label when the user explicitly asks to promote that version. Read its current labels first and include any labels the user wants to retain.",
    "Protected-label permissions apply to both adding and removing labels, even after approval.",
  ].join(" "),
  action: "skills:CUD",
  baseSchema: UpdateSkillLabelsSchema,
  inputSchema: UpdateSkillLabelsSchema,
  handler: (input, context) =>
    runMcpTool({
      spanName: "mcp.skills.updateLabels",
      context,
      fn: async () =>
        new SkillService(prisma).setLabels({
          ...input,
          projectId: context.projectId,
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
