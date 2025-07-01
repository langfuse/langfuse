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
  sendCommentMentionEmail,
} from "@langfuse/shared/src/server";
import { generateObjectLink } from "@/src/features/comments/utils/generateObjectLink";
import { env } from "@/src/env.mjs";

// Helper function to extract mentioned user IDs from comment content
function extractMentionedUserIds(
  content: string,
  projectMembers: Array<{ user: { id: string; name: string | null; email: string } }>
): string[] {
  const mentionRegex = /@([^\s@]+(?:\s+[^\s@]+)*)/g;
  const mentions = [];
  let match;

  while ((match = mentionRegex.exec(content)) !== null) {
    const mentionText = match[1];
    // Find the user by name or email
    const user = projectMembers.find(
      (member) => member.user.name === mentionText || member.user.email === mentionText
    );
    if (user) {
      mentions.push(user.user.id);
    }
  }

  return [...new Set(mentions)]; // Remove duplicates
}

export const commentsRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateCommentData)
    .mutation(async ({ input, ctx }) => {
      try {
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

        // Extract mentioned user IDs from content if there are any @ mentions
        let mentionedUserIds: string[] = input.mentionedUserIds || [];
        
        if (input.content.includes("@")) {
          // Fetch project members to validate mentions
          const projectMembers = await ctx.prisma.projectMembership.findMany({
            where: {
              projectId: input.projectId,
              organizationMembership: {
                orgId: ctx.session.orgId,
              },
            },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          });

          // Extract valid mentioned user IDs
          const extractedMentions = extractMentionedUserIds(input.content, projectMembers);
          
          // Use extracted mentions if not provided explicitly, or validate provided ones
          if (input.mentionedUserIds && input.mentionedUserIds.length > 0) {
            // Validate that all provided mentioned user IDs are valid project members
            const validUserIds = new Set(projectMembers.map((member: any) => member.user.id));
            mentionedUserIds = input.mentionedUserIds.filter((id: string) => validUserIds.has(id));
          } else {
            mentionedUserIds = extractedMentions;
          }
        }

        const comment = await ctx.prisma.comment.create({
          data: {
            projectId: input.projectId,
            content: input.content,
            objectId: input.objectId,
            objectType: input.objectType,
            authorUserId: ctx.session.user.id,
            mentionedUserIds: mentionedUserIds,
          },
        });

        await auditLog({
          session: ctx.session,
          resourceType: "comment",
          resourceId: comment.id,
          action: "create",
          after: comment,
        });

        // Send notification emails to mentioned users
        if (mentionedUserIds.length > 0) {
          try {
            // Get project and organization details for email context
            const project = await ctx.prisma.project.findUnique({
              where: { id: input.projectId },
              include: {
                organization: {
                  select: { name: true },
                },
              },
            });

            if (project) {
              // Get mentioned users' email addresses
              const mentionedUsers = await ctx.prisma.user.findMany({
                where: {
                  id: { in: mentionedUserIds },
                  organizationMemberships: {
                    some: {
                      orgId: ctx.session.orgId,
                    },
                  },
                },
                select: {
                  id: true,
                  email: true,
                  name: true,
                },
              });

              // Generate the object link based on environment
              const baseUrl = env.NEXTAUTH_URL || "https://cloud.langfuse.com";
              const objectLink = generateObjectLink(
                baseUrl,
                input.projectId,
                input.objectType,
                input.objectId
              );

              // Send email to each mentioned user
              const emailPromises = mentionedUsers
                .filter((user: any) => user.email && user.id !== ctx.session.user.id) // Don't notify the author
                .map((user: any) =>
                  sendCommentMentionEmail({
                    env,
                    to: user.email!,
                    mentionedByName: ctx.session.user.name || ctx.session.user.email || "A user",
                    mentionedByEmail: ctx.session.user.email || "",
                    commentContent: input.content,
                    objectType: input.objectType,
                    objectId: input.objectId,
                    projectName: project.name,
                    orgName: project.organization.name,
                    objectLink,
                  })
                );

              // Send emails in parallel but don't block the response
              Promise.all(emailPromises).catch((error) => {
                logger.error("Failed to send some comment mention emails", error);
              });
            }
          } catch (error) {
            logger.error("Failed to send comment mention notifications", error);
            // Don't throw - email failures shouldn't break comment creation
          }
        }

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
      try {
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
      try {
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
      try {
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
      try {
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
          commentCounts.map(({ objectId, _count }: { objectId: string; _count: { objectId: number } }) => [
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
        return new Map(
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
});
