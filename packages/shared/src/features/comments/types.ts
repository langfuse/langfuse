import { z } from "zod";
import { type CommentObjectType } from "@langfuse/shared";

const TRACE: CommentObjectType = "TRACE";
const OBSERVATION: CommentObjectType = "OBSERVATION";
const SESSION: CommentObjectType = "SESSION";
const PROMPT: CommentObjectType = "PROMPT";

export const COMMENT_OBJECT_TYPE = [
  TRACE,
  OBSERVATION,
  SESSION,
  PROMPT,
] as const;

export const CreateCommentData = z.object({
  projectId: z.string(),
  content: z.string().trim().min(1).max(500),
  objectId: z.string(),
  objectType: z.enum(COMMENT_OBJECT_TYPE),
});
