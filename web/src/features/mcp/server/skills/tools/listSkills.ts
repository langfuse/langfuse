import { ListSkillsQuerySchema } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { SkillService } from "@/src/features/skills/server";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

export const [listSkillsTool, handleListSkills] = defineTool({
  name: "listSkills",
  description:
    "List and search project skills with tags and version summaries. Supports filtering and pagination.",
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
