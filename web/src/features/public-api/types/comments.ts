import {
  CommentObjectType,
  CreateCommentData,
  publicApiPaginationZod,
} from "@langfuse/shared";
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
    content: z.string().min(1).max(3000),
    authorUserId: z.string().nullish(),
  })
  .strict();

/**
 * Endpoints
 */

// POST /comments
export const PostCommentsV1Body = CreateCommentData.extend({
  authorUserId: z.string().nullish(),
}).strict();
export const PostCommentsV1Response = z.object({ id: z.string() }).strict();

// GET /comments
export const GetCommentsV1Query = z
  .object({
    objectType: z.nativeEnum(CommentObjectType).nullish(),
    objectId: z.string().nullish(),
    authorUserId: z.string().nullish(),
    ...publicApiPaginationZod,
  })
  .strict()
  .refine(
    ({ objectId, objectType }) => {
      return objectId ? !!objectType : true;
    },
    {
      message: "objectType is required when objectId is provided",
      path: ["objectType"],
    },
  );

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
