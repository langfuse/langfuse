import { ListSkillsQuerySchema } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { SkillService } from "@/src/features/skills/server";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

export const [listSkillsTool, handleListSkills] = defineTool({
  name: "listSkills",
  description: [
    "List skills in the current project, including descriptions, versions, labels and tags.",
    "Filter by exact name, label, tag or update timestamps (fromUpdatedAt inclusive, toUpdatedAt exclusive).",
    "Pagination: page defaults to 1, limit defaults to 10 (maximum 100).",
    "Use getSkill to retrieve a version's metadata and file manifest.",
  ].join("\n"),
  action: "skills:read",
  baseSchema: ListSkillsQuerySchema,
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
  readOnlyHint: true,
});
