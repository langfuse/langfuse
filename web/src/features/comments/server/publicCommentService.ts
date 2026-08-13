import { v4 } from "uuid";
import type { z } from "zod";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import { validateCommentReferenceObject } from "@/src/features/comments/validateCommentReferenceObject";
import type {
  GetCommentV1Query,
  GetCommentsV1Query,
  PatchCommentV1Body,
  PostCommentsV1Body,
} from "@/src/features/public-api/types/comments";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { Prisma, prisma } from "@langfuse/shared/src/db";

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

type UpdateCommentInput = {
  input: z.infer<typeof PatchCommentV1Body>;
  auditScope: CommentAuditScope;
} & GetCommentInput;

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

export const updateCommentForApi = async ({
  projectId,
  commentId,
  input,
  auditScope,
}: UpdateCommentInput) => {
  // Look up first so we can audit-log the before state, and so a missing
  // comment (or one in another project) yields a clean 404 instead of a
  // Prisma P2025 racing through the update.
  const before = await getCommentRecordOrThrow({ projectId, commentId });

  // Wrap the update + audit-log in a single transaction so the two
  // operations either both succeed or both roll back. Pre-fix, a failure
  // in auditLog after prisma.comment.update returned 500 even though
  // the new content was already persisted, which let callers retry an
  // operation the server reported as failed.
  const updated = await prisma.$transaction(async (tx) => {
    let next;
    try {
      next = await tx.comment.update({
        where: {
          id: commentId,
          projectId,
        },
        data: {
          content: input.content,
        },
      });
    } catch (error) {
      // Handle the race: if the comment was deleted between the lookup
      // above and this update, Prisma throws P2025. The REST middleware
      // maps P2025 to a generic 500; surface a clean 404 instead so the
      // public API contract is preserved.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new LangfuseNotFoundError(
          "Comment not found within authorized project",
        );
      }
      throw error;
    }

    if (auditScope) {
      await auditLog(
        {
          action: "update",
          resourceType: "comment",
          resourceId: next.id,
          projectId: auditScope.projectId,
          orgId: auditScope.orgId,
          apiKeyId: auditScope.apiKeyId,
          before,
          after: next,
        },
        tx,
      );
    }

    return next;
  });

  return toPublicComment(updated);
};
