import { z } from "zod";

const COMMENT_OBJECT_TYPES = [
  "TRACE",
  "OBSERVATION",
  "SESSION",
  "PROMPT",
] as const;

export const CreateCommentData = z.object({
  projectId: z.string(),
  content: z.string().trim().min(1).max(500),
  objectId: z.string(),
  objectType: z.enum(COMMENT_OBJECT_TYPES),
});

export const DeleteCommentData = z.object({
  projectId: z.string(),
  commentId: z.string(),
  objectId: z.string(),
  objectType: z.enum(COMMENT_OBJECT_TYPES),
});
