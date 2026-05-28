import { listCommentsForApi } from "@/src/features/comments/server/publicCommentService";
import {
  GetCommentsV1Query,
  GetCommentsV1Response,
} from "@/src/features/public-api/types/comments";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

export const [listCommentsTool, handleListComments] = defineTool({
  name: "listComments",
  description:
    "List comments in the current Langfuse project, optionally filtered by object or author.",
  baseSchema: GetCommentsV1Query,
  inputSchema: GetCommentsV1Query,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.comments.list",
      context,
      attributes: {
        "mcp.comment_object_type": input.objectType ?? undefined,
        "mcp.comment_object_id": input.objectId ?? undefined,
        "mcp.pagination_page": input.page,
        "mcp.pagination_limit": input.limit,
      },
      fn: async () => {
        const result = await listCommentsForApi({
          ...input,
          projectId: context.projectId,
        });

        return GetCommentsV1Response.parse(result);
      },
    }),
  readOnlyHint: true,
});
