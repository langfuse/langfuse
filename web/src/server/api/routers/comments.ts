import { z } from "zod/v4";

import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { CommentObjectType } from "@langfuse/shared";
import { Prisma, CreateCommentData, DeleteCommentData } from "@langfuse/shared";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { TRPCError } from "@trpc/server";
import { validateCommentReferenceObject } from "@/src/features/comments/validateCommentReferenceObject";
import {
  getTracesIdentifierForSession,
  logger,
} from "@langfuse/shared/src/server";
import { type PrismaClient } from "@prisma/client";

/**
 * Enriched comment with user information
 */
type EnrichedComment = {
  id: string;
  objectId: string;
  content: string;
  createdAt: Date;
  authorUserId: string | null;
  authorUserImage: string | null;
  authorUserName: string | null;
  authorUserEmail: string | null;
};

/**
 * Fetches comments with enriched user information for a given project and object type.
 *
 * @param prisma - Prisma client instance
 * @param projectId - Project ID to filter comments
 * @param objectType - Type of object (TRACE, OBSERVATION, SESSION, PROMPT)
 * @param objectIds - Array of object IDs to fetch comments for
 * @returns Array of enriched comments with user information
 */
async function fetchCommentsWithUserInfo(
  prisma: PrismaClient,
  projectId: string,
  objectType: CommentObjectType,
  objectIds: string[],
): Promise<EnrichedComment[]> {
  if (objectIds.length === 0) {
    return [];
  }

  return prisma.$queryRaw<EnrichedComment[]>(
    Prisma.sql`
      SELECT
        c.id,
        c.object_id AS "objectId",
        c.content,
        c.created_at AS "createdAt",
        u.id AS "authorUserId",
        u.image AS "authorUserImage",
        u.name AS "authorUserName",
        u.email AS "authorUserEmail"
      FROM comments c
      LEFT JOIN users u ON u.id = c.author_user_id
      WHERE
        c."project_id" = ${projectId}
        AND c."object_type"::text = ${objectType}
        AND c."object_id" = ANY(${objectIds}::text[])
      ORDER BY
        c.created_at ASC
    `,
  );
}

export const commentsRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateCommentData)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "comments:CUD",
      });

      try {
        const result = await validateCommentReferenceObject({
          ctx,
          input,
        });

        if (result.errorMessage) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: result.errorMessage,
          });
        }

        const comment = await ctx.prisma.comment.create({
          data: {
            projectId: input.projectId,
            content: input.content,
            objectId: input.objectId,
            objectType: input.objectType,
            authorUserId: ctx.session.user.id,
          },
        });

        await auditLog({
          session: ctx.session,
          resourceType: "comment",
          resourceId: comment.id,
          action: "create",
          after: comment,
        });

        return comment;
      } catch (error) {
        logger.error("Failed to call comments.create", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Creating comment failed.",
        });
      }
    }),
  delete: protectedProjectProcedure
    .input(DeleteCommentData)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "comments:CUD",
      });

      try {
        const comment = await ctx.prisma.comment.findFirst({
          where: {
            id: input.commentId,
            projectId: input.projectId,
            objectId: input.objectId,
            objectType: input.objectType,
          },
        });
        if (!comment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No comment with this id in this project.",
          });
        }

        if (comment.authorUserId !== ctx.session.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Comment author user id does not match provided user id",
          });
        }

        await ctx.prisma.comment.delete({
          where: {
            id: comment.id,
            projectId: comment.projectId,
            objectId: comment.objectId,
            objectType: comment.objectType,
          },
        });

        await auditLog({
          session: ctx.session,
          resourceType: "comment",
          resourceId: comment.id,
          action: "delete",
          before: comment,
        });
      } catch (error) {
        logger.error("Failed to call comments.delete", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Deleting comment failed.",
        });
      }
    }),
  getByObjectId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        objectId: z.string(),
        objectType: z.enum(CommentObjectType),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "comments:read",
      });

      try {
        // For single object view, we want DESC order (most recent first)
        const comments = await ctx.prisma.$queryRaw<
          Array<{
            id: string;
            objectId: string;
            content: string;
            createdAt: Date;
            authorUserId: string | null;
            authorUserImage: string | null;
            authorUserName: string | null;
            authorUserEmail: string | null;
          }>
        >(
          Prisma.sql`
            SELECT
              c.id,
              c.object_id AS "objectId",
              c.content,
              c.created_at AS "createdAt",
              u.id AS "authorUserId",
              u.image AS "authorUserImage",
              u.name AS "authorUserName",
              u.email AS "authorUserEmail"
            FROM comments c
            LEFT JOIN users u ON u.id = c.author_user_id
            WHERE
              c."project_id" = ${input.projectId}
              AND c."object_type"::text = ${input.objectType}
              AND c."object_id" = ${input.objectId}
            ORDER BY
              c.created_at DESC
          `,
        );

        return comments;
      } catch (error) {
        logger.error("Failed to call comments.getByObjectId", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Fetching comments by object id failed.",
        });
      }
    }),
  getCountByObjectId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        objectId: z.string(),
        objectType: z.enum(CommentObjectType),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "comments:read",
      });

      try {
        const commentCount = await ctx.prisma.comment.count({
          where: {
            projectId: input.projectId,
            objectId: input.objectId,
            objectType: input.objectType,
          },
        });
        return { [input.objectId]: commentCount };
      } catch (error) {
        logger.error("Failed to call comments.getCountByObjectId", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Fetching comment count by object id failed.",
        });
      }
    }),
  getCountByObjectType: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        objectType: z.enum(CommentObjectType),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "comments:read",
      });

      try {
        // latency of query to be improved
        const commentCounts = await ctx.prisma.comment.groupBy({
          by: ["objectId"],
          where: {
            projectId: input.projectId,
            objectType: input.objectType,
          },
          _count: {
            objectId: true,
          },
        });

        return Object.fromEntries(
          commentCounts.map(({ objectId, _count }) => [
            objectId,
            _count.objectId,
          ]),
        );
      } catch (error) {
        logger.error("Failed to call comments.getCountByObjectType", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Fetching comment count by object type failed.",
        });
      }
    }),
  getTraceCommentCountsBySessionId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        sessionId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "comments:read",
      });

      try {
        const clickhouseTraces = await getTracesIdentifierForSession(
          input.projectId,
          input.sessionId,
        );

        const allTraceCommentCounts = await ctx.prisma.$queryRaw<
          Array<{ objectId: string; count: bigint }>
        >`
          SELECT object_id as "objectId", COUNT(*) as count
          FROM comments
          WHERE project_id = ${input.projectId}
          AND object_type = 'TRACE'
          GROUP BY object_id
        `;

        const traceIds = new Set(clickhouseTraces.map((t) => t.id));
        return Object.fromEntries(
          allTraceCommentCounts
            .filter((c) => traceIds.has(c.objectId))
            .map(({ objectId, count }) => [objectId, Number(count)]),
        );
      } catch (error) {
        logger.error(
          "Failed to call comments.getTraceCommentCountBySessionId",
          error,
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to get trace comment counts by session id",
        });
      }
    }),
  getTraceCommentsBySessionId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        sessionId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "comments:read",
      });

      try {
        const clickhouseTraces = await getTracesIdentifierForSession(
          input.projectId,
          input.sessionId,
        );

        const traceIds = clickhouseTraces.map((t) => t.id);

        if (traceIds.length === 0) {
          return {};
        }

        // Fetch all comments for the traces with user information
        const enrichedComments = await fetchCommentsWithUserInfo(
          ctx.prisma,
          input.projectId,
          "TRACE",
          traceIds,
        );

        // Group comments by trace ID
        const commentsByTrace: Record<string, typeof enrichedComments> = {};
        for (const comment of enrichedComments) {
          if (!commentsByTrace[comment.objectId]) {
            commentsByTrace[comment.objectId] = [];
          }
          commentsByTrace[comment.objectId].push(comment);
        }

        return commentsByTrace;
      } catch (error) {
        logger.error(
          "Failed to call comments.getTraceCommentsBySessionId",
          error,
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to get trace comments by session id",
        });
      }
    }),
});
