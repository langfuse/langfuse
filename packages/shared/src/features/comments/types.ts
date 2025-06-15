import { z } from "zod/v4";

const MAX_COMMENT_LENGTH = 3000;

const COMMENT_OBJECT_TYPES = [
  "TRACE",
  "OBSERVATION",
  "SESSION",
  "PROMPT",
] as const;

export const CreateCommentData = z.object({
  projectId: z.string(),
  content: z.string().trim().min(1).max(MAX_COMMENT_LENGTH),
  objectId: z.string(),
  objectType: z.enum(COMMENT_OBJECT_TYPES),
});

export const DeleteCommentData = z.object({
  projectId: z.string(),
  commentId: z.string(),
  objectId: z.string(),
  objectType: z.enum(COMMENT_OBJECT_TYPES),
});
