import { z } from "zod";

import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { CommentObjectType } from "../../../../../packages/shared/dist/prisma/generated/types";

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
});
