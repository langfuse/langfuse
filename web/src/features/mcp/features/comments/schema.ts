import type { z } from "zod";
import { PostCommentsV1Body } from "@/src/features/public-api/types/comments";

export const CreateCommentToolSchema = PostCommentsV1Body.omit({
  projectId: true,
});

export const publicComment = (comment: {
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

export type CreateCommentToolInput = z.infer<typeof CreateCommentToolSchema>;
