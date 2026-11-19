import { SkillNameSchema, UpdateSkillTagsBodySchema } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { SkillService } from "@/src/features/skills/server/skill-service";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

const UpdateSkillTagsSchema = UpdateSkillTagsBodySchema.extend({
  name: SkillNameSchema,
});

export const [updateSkillTagsTool, handleUpdateSkillTags] = defineTool({
  name: "updateSkillTags",
  description: [
    "Replace the tags on a skill in the current project, across all of its versions.",
    "Read the current tags with getSkill or listSkills first and include every tag to retain; an empty tags array removes all tags.",
    "This does not create a version or change version labels. Returns the latest version's metadata.",
    "Tags are used for discovery, for example the tag filter of listSkills, so changing them can change which skills a client finds.",
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
