import { CommentObjectType } from "@langfuse/shared";
import { z } from "zod";
import { createCommentForApi } from "@/src/features/comments/server/publicCommentService";
import {
  PostCommentsV1Body,
  PostCommentsV1Response,
} from "@/src/features/public-api/types/comments";
import { defineTool } from "../../../core/define-tool";
import { buildCommentObjectUrl } from "@langfuse/shared/src/server";
import { runMcpTool } from "../../../core/run-mcp-tool";

const CreateCommentToolBaseSchema = z
  .object({
    content: z.string().trim().min(1).max(5000),
    objectId: z
      .string()
      .describe(
        "A trace or observation ID (from listObservations or getObservation), a session ID, or a prompt version's id (from getPrompt).",
      ),
    objectType: z.enum(CommentObjectType),
    authorUserId: z
      .string()
      .optional()
      .describe(
        "Langfuse user ID of an organization member to attribute the comment to; omit to leave it unset.",
      ),
  })
  .strict();

const CreateCommentToolSchema = PostCommentsV1Body.omit({
  projectId: true,
});

export const [createCommentTool, handleCreateComment] = defineTool({
  name: "createComment",
  description:
    "Add a comment to a trace, observation, session, or prompt version and return its id (and UI url when available). Each call adds another comment; fails if the target does not exist.",
  action: "comments:CUD",
  baseSchema: CreateCommentToolBaseSchema,
  inputSchema: CreateCommentToolSchema,
  annotations: { readOnlyHint: false, destructiveHint: false },
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

        const comment = PostCommentsV1Response.parse(result);
        const url = buildCommentObjectUrl({
          projectId: context.projectId,
          objectType: input.objectType,
          objectId: input.objectId,
        });

        return url ? { ...comment, url } : comment;
      },
    }),
});
