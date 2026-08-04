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

type CommentListRow = {
  id: string;
  project_id: string;
  created_at: Date;
  updated_at: Date;
  object_type: "TRACE" | "OBSERVATION" | "SESSION" | "PROMPT";
  object_id: string;
  content: string;
  author_user_id: string | null;
};

const buildCommentListWhereSql = ({
  projectId,
  objectType,
  objectId,
  authorUserId,
  content,
}: {
  projectId: string;
  objectType?: ListCommentsInput["objectType"];
  objectId?: string | null;
  authorUserId?: string | null;
  content: string;
}) => {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`project_id = ${projectId}`,
    // Use the GIN full-text index (idx_comments_content_gin). ILIKE '%term%'
    // cannot use that index and would scan comments twice (rows + count).
    Prisma.sql`to_tsvector('english', content) @@ plainto_tsquery('english', ${content})`,
  ];

  if (objectType) {
    conditions.push(
      Prisma.sql`object_type = ${objectType}::"CommentObjectType"`,
    );
  }
  if (objectId) {
    conditions.push(Prisma.sql`object_id = ${objectId}`);
  }
  if (authorUserId) {
    conditions.push(Prisma.sql`author_user_id = ${authorUserId}`);
  }

  return Prisma.join(conditions, " AND ");
};

export const listCommentsForApi = async ({
  projectId,
  objectType,
  objectId,
  authorUserId,
  content,
  limit,
  page,
}: ListCommentsInput) => {
  if (content) {
    const whereSql = buildCommentListWhereSql({
      projectId,
      objectType,
      objectId,
      authorUserId,
      content,
    });
    const offset = (page - 1) * limit;

    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw<CommentListRow[]>`
        SELECT
          id,
          project_id,
          created_at,
          updated_at,
          object_type,
          object_id,
          content,
          author_user_id
        FROM comments
        WHERE ${whereSql}
        LIMIT ${limit}
        OFFSET ${offset}
      `,
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM comments
        WHERE ${whereSql}
      `,
    ]);

    const totalItems = Number(countRows[0]?.count ?? 0);

    return {
      data: rows.map((row) =>
        toPublicComment({
          id: row.id,
          projectId: row.project_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          objectType: row.object_type,
          objectId: row.object_id,
          content: row.content,
          authorUserId: row.author_user_id,
        }),
      ),
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

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
