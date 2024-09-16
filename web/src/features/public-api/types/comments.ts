import { CommentObjectType, CreateCommentData } from "@langfuse/shared";
import { z } from "zod";

/**
 * Objects
 */

const APIComment = z
  .strictObject({
    id: z.string(),
    projectId: z.string(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    objectType: z.nativeEnum(CommentObjectType),
    objectId: z.string(),
    content: z.string(),
    authorUserId: z.string().nullable(),
  })
  .strict();

/**
 * Endpoints
 */

// POST /comments
export const PostCommentsV1Body = CreateCommentData;
export const PostCommentsV1Response = z.object({ id: z.string() }).strict();

// GET /comments
export const GetCommentsV1Query = z
  .object({
    objectType: z.nativeEnum(CommentObjectType).optional(),
    objectId: z.string().optional(),
    authorUserId: z.string().optional(),
  }) // TODO: add custom validation to ask for both objectType and objectId
  .strict();
export const GetCommentsV1Response = z
  .object({
    data: z.array(APIComment),
  })
  .strict();

// GET /comments/:id
export const GetCommentV1Query = z
  .object({
    commentId: z.string(),
  })
  .strict();
export const GetCommentV1Response = APIComment;
