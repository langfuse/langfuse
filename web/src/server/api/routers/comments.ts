import { z } from "zod";

import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { CommentObjectType } from "../../../../../packages/shared/dist/prisma/generated/types";
import { Prisma } from "@langfuse/shared";

const CreateCommentData = z.object({
  projectId: z.string(),
  content: z.string(),
  objectId: z.string(),
  objectType: z.nativeEnum(CommentObjectType),
});

const COMMENT_OBJECT_TYPE_TO_PRISMA_MODEL = new Map<CommentObjectType, string>([
  [CommentObjectType.TRACE, "trace"],
  [CommentObjectType.OBSERVATION, "observation"],
  [CommentObjectType.SESSION, "session"],
  [CommentObjectType.PROMPT, "prompt"],
]);

const validateCommentReferenceObject = async ({
  ctx,
  input,
}: {
  ctx: any;
  input: z.infer<typeof CreateCommentData>;
}): Promise<void> => {
  const { objectId, objectType, projectId } = input;
  const prismaModel = COMMENT_OBJECT_TYPE_TO_PRISMA_MODEL.get(
    objectType,
  ) as string;

  const object = await ctx.prisma[prismaModel].findFirst({
    where: {
      id: objectId,
      projectId,
    },
  });

  if (!object) {
    throw new Error(
      `No ${prismaModel} with id ${objectId} in project ${projectId}`,
    );
  }
};

export const commentsRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateCommentData)
    .mutation(async ({ input, ctx }) => {
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

      return comment;
    }),
  delete: protectedProjectProcedure
    .input(
      z.object({ projectId: z.string(), id: z.string(), userId: z.string() }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "comments:CUD",
      });

      const comment = await ctx.prisma.comment.findFirst({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
      });
      if (!comment) {
        throw new Error("No comment with this id in this project.");
      }

      if (comment.authorUserId !== input.userId) {
        throw new Error(
          "Comment author user id does not match provided user id",
        );
      }

      return await ctx.prisma.score.delete({
        where: {
          id: comment.id,
          projectId: input.projectId,
        },
      });
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
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "comments:read",
      });

      const comments = await ctx.prisma.$queryRaw<
        Array<{
          id: string;
          content: string;
          timestamp: Date;
          authorUserId: string | null;
          authorUserImage: string | null;
          authorUserName: string | null;
        }>
      >(
        Prisma.sql`
        SELECT
          c.id, 
          c.content, 
          c.timestamp,
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
          timestamp DESC
        `,
      );

      return comments;
    }),
  getCountsByObjectIds: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        objectIds: z.array(z.string()),
        objectType: z.nativeEnum(CommentObjectType),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "comments:read",
      });

      const comments = await ctx.prisma.comment.findMany({
        select: {
          id: true,
          objectId: true,
        },
        where: {
          projectId: input.projectId,
          objectId: { in: input.objectIds },
          objectType: input.objectType,
        },
      });
      const commentCountByObject = new Map<string, number>();

      comments.forEach(({ objectId }) => {
        const prevCount = commentCountByObject.get(objectId);
        if (!!prevCount) {
          commentCountByObject.set(objectId, prevCount + 1);
        } else {
          commentCountByObject.set(objectId, 1);
        }
      });

      return commentCountByObject;
    }),
});
