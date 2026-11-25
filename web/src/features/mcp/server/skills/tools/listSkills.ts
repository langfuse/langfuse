import { ListSkillsQuerySchema } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { SkillService } from "@/src/features/skills/server/skill-service";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

const ListSkillsBaseSchema = ListSkillsQuerySchema.extend({
  name: ListSkillsQuerySchema.shape.name.describe(
    "Exact name; use search for partial matches.",
  ),
  search: ListSkillsQuerySchema.shape.search.describe(
    "Case-insensitive substring of name or description.",
  ),
  tag: ListSkillsQuerySchema.shape.tag.describe("Exact tag."),
  fromUpdatedAt: ListSkillsQuerySchema.shape.fromUpdatedAt.describe(
    "Inclusive lower bound on latestVersionLastUpdatedAt.",
  ),
  toUpdatedAt: ListSkillsQuerySchema.shape.toUpdatedAt.describe(
    "Exclusive upper bound on latestVersionLastUpdatedAt.",
  ),
});

export const [listSkillsTool, handleListSkills] = defineTool({
  name: "listSkills",
  description:
    "List the project's agent skills (versioned SKILL.md bundles), most recently updated first, paginated, with name, description, tags, latestVersion and productionVersion. Filters are ANDed. Use getSkill for a skill's files and loadSkill to read its SKILL.md.",
  action: "skills:read",
  baseSchema: ListSkillsBaseSchema,
  inputSchema: ListSkillsQuerySchema,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.skills.list",
      context,
      fn: async () =>
        new SkillService(prisma).list({
          projectId: context.projectId,
          input,
        }),
    }),
  annotations: { readOnlyHint: true },
});
