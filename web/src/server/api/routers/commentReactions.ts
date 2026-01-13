import { z } from "zod/v4";
import {
  throwIfNoProjectAccess,
  hasProjectAccess,
} from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { logger } from "@langfuse/shared/src/server";

export const commentReactionsRouter = createTRPCRouter({
  add: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        commentId: z.string(),
        emoji: z.string().regex(/\p{Emoji}/u, "Must be a valid emoji"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "comments:CUD",
        });

        // Verify comment exists in project
        const comment = await ctx.prisma.comment.findFirst({
          where: {
            id: input.commentId,
            projectId: input.projectId,
          },
        });

        if (!comment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Comment not found",
          });
        }

        // Upsert reaction (idempotent)
        // Use comment.projectId (verified DB record) instead of input.projectId
        // to guard against edge cases where input could be undefined despite validation
        const reaction = await ctx.prisma.commentReaction.upsert({
          where: {
            commentId_userId_emoji: {
              commentId: input.commentId,
              userId: ctx.session.user.id,
              emoji: input.emoji,
            },
          },
          create: {
            projectId: comment.projectId,
            commentId: input.commentId,
            userId: ctx.session.user.id,
            emoji: input.emoji,
          },
          update: {}, // Already exists, no-op
        });

        return reaction;
      } catch (error) {
        logger.error("Failed to call commentReactions.add", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Adding reaction failed.",
        });
      }
    }),

  remove: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        commentId: z.string(),
        emoji: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "comments:CUD",
        });

        // Verify comment exists in project
        const comment = await ctx.prisma.comment.findFirst({
          where: {
            id: input.commentId,
            projectId: input.projectId,
          },
        });

        if (!comment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Comment not found",
          });
        }

        // Delete reaction with project safety check
        // Use comment.projectId (verified DB record) instead of input.projectId
        const deletedReaction = await ctx.prisma.commentReaction.deleteMany({
          where: {
            commentId: input.commentId,
            userId: ctx.session.user.id,
            emoji: input.emoji,
            projectId: comment.projectId,
          },
        });

        if (deletedReaction.count === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Reaction not found",
          });
        }

        return;
      } catch (error) {
        logger.error("Failed to call commentReactions.remove", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Removing reaction failed.",
        });
      }
    }),

  listForComment: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        commentId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "comments:read",
        });

        // Verify comment exists in project
        const comment = await ctx.prisma.comment.findFirst({
          where: {
            id: input.commentId,
            projectId: input.projectId,
          },
        });

        if (!comment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Comment not found",
          });
        }

        // Check if user has permission to see user details
        const hasCommentsCUD = hasProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "comments:CUD",
        });
        const hasMembersRead = hasProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "projectMembers:read",
        });

        const canSeeUserDetails = hasCommentsCUD && hasMembersRead;

        // Debug logging
        logger.info("Reaction permissions check", {
          hasCommentsCUD,
          hasMembersRead,
          canSeeUserDetails,
        });

        const reactions = await ctx.prisma.commentReaction.findMany({
          where: {
            commentId: input.commentId,
            projectId: input.projectId,
          },
          orderBy: { createdAt: "asc" },
          ...(canSeeUserDetails && {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          }),
        });

        // Aggregate by emoji
        const aggregated = reactions.reduce(
          (acc, reaction) => {
            if (!acc[reaction.emoji]) {
              acc[reaction.emoji] = {
                emoji: reaction.emoji,
                count: 0,
                users: canSeeUserDetails ? [] : undefined,
                hasReacted: false,
              };
            }
            acc[reaction.emoji].count++;

            // Only include user details if user has permission
            if (
              canSeeUserDetails &&
              "user" in reaction &&
              reaction.user &&
              typeof reaction.user === "object"
            ) {
              const user = reaction.user as {
                id: string;
                name: string | null;
              };
              acc[reaction.emoji].users!.push({
                id: user.id,
                name: user.name,
              });
            }

            if (reaction.userId === ctx.session.user.id) {
              acc[reaction.emoji].hasReacted = true;
            }
            return acc;
          },
          {} as Record<
            string,
            {
              emoji: string;
              count: number;
              users?: Array<{
                id: string;
                name: string | null;
              }>;
              hasReacted: boolean;
            }
          >,
        );

        return Object.values(aggregated);
      } catch (error) {
        logger.error("Failed to call commentReactions.listForComment", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Fetching reactions failed.",
        });
      }
    }),
});
