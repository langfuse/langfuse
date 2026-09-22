import { z } from "zod";
import { prisma } from "@langfuse/shared/src/db";
import { SkillService } from "@/src/features/skills/server";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

const GetSkillFileSchema = z.object({
  fileId: z.string().min(1).describe("A file id from the getSkill manifest"),
});

export const [getSkillFileTool, handleGetSkillFile] = defineTool({
  name: "getSkillFile",
  description: [
    "Get a presigned download URL for one file from a persisted skill version in the current project.",
    "Pass the file's id from getSkill, not its blobId. The URL expires after 15 minutes.",
    "Download bytes directly from the URL; file contents are not included in this response.",
  ].join("\n"),
  action: "skills:read",
  baseSchema: GetSkillFileSchema,
  inputSchema: GetSkillFileSchema,
  handler: async ({ fileId }, context) =>
    runMcpTool({
      spanName: "mcp.skills.get_file",
      context,
      fn: async () =>
        new SkillService(prisma).getFileDownload({
          projectId: context.projectId,
          fileId,
        }),
    }),
  readOnlyHint: true,
});
