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

const maxApiKeyCreatorDepth = 10;

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

/** createCommentForApi attributes comments to authenticated users or API key creators. */
export const createCommentForApi = async ({
  input,
  auditScope,
}: {
  input: z.infer<typeof PostCommentsV1Body>;
  auditScope: CommentAuditScope;
}) => {
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

  const authorUserId =
    auditScope.userId ?? (await resolveApiKeyCreator(auditScope));

  const comment = await prisma.comment.create({
    data: {
      content: input.content,
      objectId: input.objectId,
      objectType: input.objectType,
      authorUserId,
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

/** resolveApiKeyCreator follows creator keys within the authenticated tenant. */
const resolveApiKeyCreator = async ({
  apiKeyId,
  projectId,
  orgId,
}: CommentAuditScope): Promise<string | null> => {
  const [creator] = await prisma.$queryRaw<{ userId: string }[]>`
    WITH RECURSIVE creator_keys AS (
      SELECT id, created_by_user_id, created_by_api_key_id, 0 AS depth
      FROM api_keys
      WHERE id = ${apiKeyId}
        AND (
          (scope = 'PROJECT' AND project_id = ${projectId})
          OR (scope = 'ORGANIZATION' AND organization_id = ${orgId})
        )
      UNION ALL
      SELECT parent.id, parent.created_by_user_id, parent.created_by_api_key_id, child.depth + 1
      FROM api_keys parent
      JOIN creator_keys child ON parent.id = child.created_by_api_key_id
      WHERE child.created_by_user_id IS NULL
        AND child.depth < ${maxApiKeyCreatorDepth}
        AND (
          (parent.scope = 'PROJECT' AND parent.project_id = ${projectId})
          OR (parent.scope = 'ORGANIZATION' AND parent.organization_id = ${orgId})
        )
    )
    SELECT created_by_user_id AS "userId"
    FROM creator_keys
    WHERE created_by_user_id IS NOT NULL
    LIMIT 1
  `;

  return creator?.userId ?? null;
};

type CommentAuditScope = {
  projectId: string;
  orgId: string;
  apiKeyId: string;
  userId?: string | null;
};
