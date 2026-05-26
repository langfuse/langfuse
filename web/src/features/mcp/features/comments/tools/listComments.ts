import { prisma } from "@langfuse/shared/src/db";
import {
  GetCommentsV1Query,
  GetCommentsV1Response,
} from "@/src/features/public-api/types/comments";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { paginationMeta } from "../../publicApi";
import { publicComment } from "../schema";

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
        const where = {
          projectId: context.projectId,
          objectType: input.objectType ?? undefined,
          objectId: input.objectId ?? undefined,
          authorUserId: input.authorUserId ?? undefined,
        };

        const [comments, totalItems] = await Promise.all([
          prisma.comment.findMany({
            where,
            take: input.limit,
            skip: (input.page - 1) * input.limit,
          }),
          prisma.comment.count({ where }),
        ]);

        return GetCommentsV1Response.parse({
          data: comments.map(publicComment),
          meta: paginationMeta({
            page: input.page,
            limit: input.limit,
            totalItems,
          }),
        });
      },
    }),
  readOnlyHint: true,
});
