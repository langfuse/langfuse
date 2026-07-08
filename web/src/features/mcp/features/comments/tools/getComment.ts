import { getCommentForApi } from "@/src/features/comments/server/publicCommentService";
import {
  GetCommentV1Query,
  GetCommentV1Response,
} from "@/src/features/public-api/types/comments";
import { defineTool } from "../../../core/define-tool";
import { buildCommentObjectUrl } from "@/src/utils/product-url";
import { runMcpTool } from "../../../core/run-mcp-tool";

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
        const result = await getCommentForApi({
          commentId: input.commentId,
          projectId: context.projectId,
        });

        const comment = GetCommentV1Response.parse(result);
        const url = buildCommentObjectUrl({
          projectId: context.projectId,
          objectType: comment.objectType,
          objectId: comment.objectId,
        });

        return url ? { ...comment, url } : comment;
      },
    }),
  readOnlyHint: true,
});
