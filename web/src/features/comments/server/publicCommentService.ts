import { v4 } from "uuid";
import type { z } from "zod";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import { validateCommentReferenceObject } from "@/src/features/comments/validateCommentReferenceObject";
import type {
  GetCommentV1Query,
  GetCommentsV1Query,
  PostCommentsV1Body,
} from "@/src/features/public-api/types/comments";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";

type CommentAuditScope = {
  projectId: string;
  orgId: string;
  apiKeyId: string;
};

type CreateCommentInput = {
  input: z.infer<typeof PostCommentsV1Body>;
  auditScope: CommentAuditScope;
};

type ListCommentsInput = z.infer<typeof GetCommentsV1Query> & {
  projectId: string;
};

type GetCommentInput = z.infer<typeof GetCommentV1Query> & {
  projectId: string;
};

// Exclude inline positioning fields from public API.
const toPublicComment = (comment: {
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

export const getCommentRecordOrThrow = async ({
  projectId,
  commentId,
}: GetCommentInput) => {
  const comment = await prisma.comment.findUnique({
    where: {
      id: commentId,
      projectId,
    },
  });

  if (!comment) {
    throw new LangfuseNotFoundError(
      "Comment not found within authorized project",
    );
  }

  return comment;
};

export const createCommentForApi = async ({
  input,
  auditScope,
}: CreateCommentInput) => {
  const result = await validateCommentReferenceObject({
    ctx: { prisma, auth: { scope: { projectId: auditScope.projectId } } },
    input: {
      ...input,
      projectId: auditScope.projectId,
    },
  });

  if (result.errorMessage) {
    throw new LangfuseNotFoundError(result.errorMessage);
  }

  // Create comment with content as-is (no mention processing, no inline positioning).
  const comment = await prisma.comment.create({
    data: {
      content: input.content,
      objectId: input.objectId,
      objectType: input.objectType,
      authorUserId: input.authorUserId,
      id: v4(),
      projectId: auditScope.projectId,
    },
  });

  await auditLog({
    action: "create",
    resourceType: "comment",
    resourceId: comment.id,
    projectId: auditScope.projectId,
    orgId: auditScope.orgId,
    apiKeyId: auditScope.apiKeyId,
    after: comment,
  });

  return { id: comment.id };
};

export const listCommentsForApi = async ({
  projectId,
  objectType,
  objectId,
  authorUserId,
  limit,
  page,
}: ListCommentsInput) => {
  const where = {
    projectId,
    objectType: objectType ?? undefined,
    objectId: objectId ?? undefined,
    authorUserId: authorUserId ?? undefined,
  };

  const [comments, totalItems] = await Promise.all([
    prisma.comment.findMany({
      where,
      take: limit,
      skip: (page - 1) * limit,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.comment.count({ where }),
  ]);

  return {
    data: comments.map(toPublicComment),
    meta: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

export const getCommentForApi = async ({
  projectId,
  commentId,
}: GetCommentInput) => {
  const comment = await getCommentRecordOrThrow({ projectId, commentId });
  return toPublicComment(comment);
};
