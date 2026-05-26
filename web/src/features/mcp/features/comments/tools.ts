import { LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { v4 } from "uuid";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { validateCommentReferenceObject } from "@/src/features/comments/validateCommentReferenceObject";
import {
  GetCommentV1Query,
  GetCommentV1Response,
  GetCommentsV1Query,
  GetCommentsV1Response,
  PostCommentsV1Body,
  PostCommentsV1Response,
} from "@/src/features/public-api/types/comments";
import { defineTool } from "../../core/define-tool";
import { paginationMeta, runPublicApiTool } from "../publicApi";

const CreateCommentToolSchema = PostCommentsV1Body.omit({
  projectId: true,
});

const publicComment = (comment: {
  id: string;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
  objectType: "TRACE" | "OBSERVATION" | "SESSION" | "PROMPT";
  objectId: string;
  content: string;
  authorUserId: string | null;
}) => ({
  id: comment.id,
  projectId: comment.projectId,
  createdAt: comment.createdAt,
  updatedAt: comment.updatedAt,
  objectType: comment.objectType,
  objectId: comment.objectId,
  content: comment.content,
  authorUserId: comment.authorUserId,
});

export const [createCommentTool, handleCreateComment] = defineTool({
  name: "createComment",
  description:
    "Create a comment on a trace, observation, session, or prompt in the current Langfuse project.",
  baseSchema: CreateCommentToolSchema,
  inputSchema: CreateCommentToolSchema,
  handler: async (input, context) =>
    runPublicApiTool({
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

        const result = await validateCommentReferenceObject({
          ctx: {
            prisma,
            auth: { scope: { projectId: context.projectId } },
          },
          input: body,
        });

        if (result.errorMessage) {
          throw new LangfuseNotFoundError(result.errorMessage);
        }

        const comment = await prisma.comment.create({
          data: {
            content: body.content,
            objectId: body.objectId,
            objectType: body.objectType,
            authorUserId: body.authorUserId,
            id: v4(),
            projectId: context.projectId,
          },
        });

        await auditLog({
          action: "create",
          resourceType: "comment",
          resourceId: comment.id,
          projectId: context.projectId,
          orgId: context.orgId,
          apiKeyId: context.apiKeyId,
          after: comment,
        });

        return PostCommentsV1Response.parse({ id: comment.id });
      },
    }),
});

export const [listCommentsTool, handleListComments] = defineTool({
  name: "listComments",
  description:
    "List comments in the current Langfuse project, optionally filtered by object or author.",
  baseSchema: GetCommentsV1Query,
  inputSchema: GetCommentsV1Query,
  handler: async (input, context) =>
    runPublicApiTool({
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
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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

export const [getCommentTool, handleGetComment] = defineTool({
  name: "getComment",
  description: "Get a comment by ID from the current Langfuse project.",
  baseSchema: GetCommentV1Query,
  inputSchema: GetCommentV1Query,
  handler: async (input, context) =>
    runPublicApiTool({
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
