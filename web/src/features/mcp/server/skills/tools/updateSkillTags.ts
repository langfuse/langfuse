import { SkillNameSchema, UpdateSkillTagsBodySchema } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { SkillService } from "@/src/features/skills/server";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

const UpdateSkillTagsSchema = UpdateSkillTagsBodySchema.extend({
  name: SkillNameSchema,
});

export const [updateSkillTagsTool, handleUpdateSkillTags] = defineTool({
  name: "updateSkillTags",
  description: [
    "Replace the tags on a skill in the current project, across all of its versions.",
    "Read the current tags first and include every tag to retain; an empty tags array removes all tags.",
    "This does not create a version or change version labels. Returns the latest version's metadata.",
    "Adding or removing discovery tags can change which skills integrations, including Halo, load.",
  ].join(" "),
  action: "skills:CUD",
  baseSchema: UpdateSkillTagsSchema,
  inputSchema: UpdateSkillTagsSchema,
  handler: (input, context) =>
    runMcpTool({
      spanName: "mcp.skills.updateTags",
      context,
      fn: async () =>
        new SkillService(prisma).setTags({
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
