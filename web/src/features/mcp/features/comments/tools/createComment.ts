import { createCommentForApi } from "@/src/features/comments/server/publicCommentService";
import {
  PostCommentsV1Body,
  PostCommentsV1Response,
} from "@/src/features/public-api/types/comments";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { CreateCommentToolSchema } from "../schema";

export const [createCommentTool, handleCreateComment] = defineTool({
  name: "createComment",
  description: "Create a comment on a trace, observation, session, or prompt.",
  baseSchema: CreateCommentToolSchema,
  inputSchema: CreateCommentToolSchema,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.comments.create",
      context,
      attributes: {
        "mcp.comment_object_type": input.objectType,
        "mcp.comment_object_id": input.objectId,
      },
      fn: async () => {
        const body = PostCommentsV1Body.parse({
          ...input,
          projectId: context.projectId,
        });

        const result = await createCommentForApi({
          input: body,
          auditScope: context,
        });

        return PostCommentsV1Response.parse(result);
      },
    }),
});
