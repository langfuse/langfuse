import { LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  GetCommentV1Query,
  GetCommentV1Response,
} from "@/src/features/public-api/types/comments";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { publicComment } from "../schema";

export const [getCommentTool, handleGetComment] = defineTool({
  name: "getComment",
  description: "Get a comment by ID from the current Langfuse project.",
  baseSchema: GetCommentV1Query,
  inputSchema: GetCommentV1Query,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.comments.get",
      context,
      attributes: { "mcp.comment_id": input.commentId },
      fn: async () => {
        const comment = await prisma.comment.findUnique({
          where: {
            id: input.commentId,
            projectId: context.projectId,
          },
        });

        if (!comment) {
          throw new LangfuseNotFoundError(
            "Comment not found within authorized project",
          );
        }

        return GetCommentV1Response.parse(publicComment(comment));
      },
    }),
  readOnlyHint: true,
});
