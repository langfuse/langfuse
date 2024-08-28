import { z } from "zod";

import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { CommentObjectType } from "@langfuse/shared";
import { Prisma, CreateCommentData, DeleteCommentData } from "@langfuse/shared";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { TRPCError } from "@trpc/server";

const COMMENT_OBJECT_TYPE_TO_PRISMA_MODEL = {
  [CommentObjectType.TRACE]: "trace",
  [CommentObjectType.OBSERVATION]: "observation",
  [CommentObjectType.SESSION]: "traceSession",
  [CommentObjectType.PROMPT]: "prompt",
} as const;

const validateCommentReferenceObject = async ({
  ctx,
  input,
}: {
  ctx: any;
  input: z.infer<typeof CreateCommentData>;
}): Promise<void> => {
  const { objectId, objectType, projectId } = input;
  const prismaModel = COMMENT_OBJECT_TYPE_TO_PRISMA_MODEL[objectType];

  if (!prismaModel) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `No prisma model for object type ${objectType}`,
    });
  }

  const model = ctx.prisma[prismaModel];
  const object = await model.findFirst({
    where: {
      id: objectId,
      projectId,
    },
  });

  if (!object) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `No ${prismaModel} with id ${objectId} in project ${projectId}`,
    });
  }
};

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

        validateCommentReferenceObject({ ctx, input });

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
        console.error(error);
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
        console.error(error);
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
        objectType: z.nativeEnum(CommentObjectType),
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
        console.error(error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Fetching comments by object id failed.",
        });
      }
    }),
  // deprecated procedure, returns empty map, kept to prevent caching issues
  getCountsByObjectIds: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        objectIds: z.array(z.string()),
        objectType: z.nativeEnum(CommentObjectType),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "comments:read",
        });

        return new Map();
      } catch (error) {
        console.error(error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Fetching comment count by object id failed.",
        });
      }
    }),
  getCountByObjectId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        objectId: z.string(),
        objectType: z.nativeEnum(CommentObjectType),
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
        console.error(error);
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
        objectType: z.nativeEnum(CommentObjectType),
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
          commentCounts.map(({ objectId, _count }) => [
            objectId,
            _count.objectId,
          ]),
        );
      } catch (error) {
        console.error(error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Fetching comment count by object type failed.",
        });
      }
    }),
});
