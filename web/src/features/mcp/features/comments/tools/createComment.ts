import { v4 } from "uuid";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { validateCommentReferenceObject } from "@/src/features/comments/validateCommentReferenceObject";
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
