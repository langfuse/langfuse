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
  NotificationQueue,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { getUserProjectRoles } from "@langfuse/shared/src/server";
import {
  extractUniqueMentionedUserIds,
  sanitizeMentions,
} from "@/src/features/comments/lib/mentionParser";

export const commentsRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateCommentData)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "comments:CUD",
      });

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

      // Extract mentions from content (server-side, authoritative)
      const mentionedUserIds = extractUniqueMentionedUserIds(input.content);

      // Sanitize mentions
      let sanitizedContent = input.content;
      let validMentionedUserIds: string[] = [];

      if (mentionedUserIds.length > 0) {
        // Check projectMembers:read permission if mentioning users
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "projectMembers:read",
          forbiddenErrorMessage:
            "You need projectMembers:read permission to mention users in comments",
        });

        // Fetch only the mentioned users - more efficient than fetching all project members
        const projectMembers = await getUserProjectRoles({
          projectId: input.projectId,
          orgId: ctx.session.orgId,
          searchFilter: Prisma.empty,
          filterCondition: [
            {
              column: "userId",
              operator: "any of",
              value: mentionedUserIds,
              type: "stringOptions",
            },
          ],
          orderBy: Prisma.empty,
        });

        // Sanitize content: validate users and normalize display names
        const sanitizationResult = sanitizeMentions(
          input.content,
          projectMembers,
        );
        sanitizedContent = sanitizationResult.sanitizedContent;
        validMentionedUserIds = sanitizationResult.validMentionedUserIds;
      }

      // Create comment with sanitized content
      const comment = await ctx.prisma.comment.create({
        data: {
          projectId: input.projectId,
          content: sanitizedContent, // Use sanitized content
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

      // Enqueue notification job for mentioned users
      if (validMentionedUserIds.length > 0) {
        const notificationQueue = NotificationQueue.getInstance();
        if (notificationQueue) {
          try {
            await notificationQueue.add(QueueJobs.NotificationJob, {
              timestamp: new Date(),
              id: comment.id,
              payload: {
                type: "COMMENT_MENTION" as const,
                commentId: comment.id,
                projectId: input.projectId,
                mentionedUserIds: validMentionedUserIds,
              },
              name: QueueJobs.NotificationJob,
            });
            logger.info(
              `Notification job enqueued for comment ${comment.id} with ${validMentionedUserIds.length} mentions`,
            );
          } catch (error) {
            // Log but don't fail the request if notification queueing fails
            logger.error("Failed to enqueue notification job", error);
          }
        }
      }
      return comment;
    }),
  delete: protectedProjectProcedure
    .input(DeleteCommentData)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "comments:CUD",
      });

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

      const comments = await ctx.prisma.$queryRaw<
        Array<{
          id: string;
          content: string;
          createdAt: Date;
          authorUserId: string | null;
          authorUserImage: string | null;
          authorUserName: string | null;
        }>
      >(
        Prisma.sql`
        SELECT
          c.id,
          c.content,
          c.created_at AS "createdAt",
          u.id AS "authorUserId",
          u.image AS "authorUserImage",
          u.name AS "authorUserName"
        FROM comments c
        LEFT JOIN users u ON u.id = c.author_user_id AND u.id in (SELECT user_id FROM organization_memberships WHERE org_id = ${ctx.session.orgId})
        WHERE
          c."project_id" = ${input.projectId}
          AND c."object_id" = ${input.objectId}
          AND c."object_type"::text = ${input.objectType}
        ORDER BY
          c.created_at ASC
        `,
      );

      return comments;
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

      const commentCount = await ctx.prisma.comment.count({
        where: {
          projectId: input.projectId,
          objectId: input.objectId,
          objectType: input.objectType,
        },
      });
      return new Map([[input.objectId, commentCount]]);
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

      return new Map(
        commentCounts.map(({ objectId, _count }) => [
          objectId,
          _count.objectId,
        ]),
      );
    }),
  getCountByObjectIds: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        objectType: z.enum(CommentObjectType),
        objectIds: z.array(z.string()).min(1),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "comments:read",
        });

        const commentCounts = await ctx.prisma.comment.groupBy({
          by: ["objectId"],
          where: {
            projectId: input.projectId,
            objectType: input.objectType,
            objectId: { in: input.objectIds },
          },
          _count: {
            objectId: true,
          },
        });

        // Return as a Map<string, number>
        return new Map(
          commentCounts.map(({ objectId, _count }) => [
            objectId,
            _count.objectId,
          ]),
        );
      } catch (error) {
        logger.error("Failed to call comments.getCountByObjectIds", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Fetching comment counts by object ids failed.",
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
      return new Map(
        allTraceCommentCounts
          .filter((c) => traceIds.has(c.objectId))
          .map(({ objectId, count }) => [objectId, Number(count)]),
      );
    }),
});
