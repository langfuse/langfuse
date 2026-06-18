import { CommentObjectType, publicApiPaginationZod } from "@langfuse/shared";
import { z } from "zod";
import { listCommentsForApi } from "@/src/features/comments/server/publicCommentService";
import {
  GetCommentsV1Query,
  GetCommentsV1Response,
} from "@/src/features/public-api/types/comments";
import { defineTool } from "../../../core/define-tool";
import { buildCommentObjectUrl } from "@/src/utils/product-url";
import { runMcpTool } from "../../../core/run-mcp-tool";

const ListCommentsBaseSchema = z
  .object({
    objectType: z.enum(CommentObjectType).optional(),
    objectId: z.string().optional(),
    authorUserId: z.string().optional(),
    ...publicApiPaginationZod,
  })
  .strict();

export const [listCommentsTool, handleListComments] = defineTool({
  name: "listComments",
  description:
    "List comments in the current Langfuse project, optionally filtered by object or author.",
  baseSchema: ListCommentsBaseSchema,
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

        const parsed = GetCommentsV1Response.parse(result);

        return {
          ...parsed,
          data: parsed.data.map((comment) => {
            const url = buildCommentObjectUrl({
              projectId: context.projectId,
              objectType: comment.objectType,
              objectId: comment.objectId,
            });

            return url ? { ...comment, url } : comment;
          }),
        };
      },
    }),
  readOnlyHint: true,
});
