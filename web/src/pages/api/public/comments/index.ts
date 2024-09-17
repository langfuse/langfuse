import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import {
  GetCommentsV1Query,
  GetCommentsV1Response,
  PostCommentsV1Body,
  PostCommentsV1Response,
} from "@/src/features/public-api/types/comments";
import { prisma } from "@langfuse/shared/src/db";
import { v4 } from "uuid";

export default withMiddlewares({
  POST: createAuthedAPIRoute({
    name: "Create Comment",
    bodySchema: PostCommentsV1Body,
    responseSchema: PostCommentsV1Response,
    fn: async ({ body, auth }) => {
      const comment = await prisma.comment.create({
        data: {
          ...body,
          id: v4(),
          projectId: auth.scope.projectId,
        },
      });

      return { id: comment.id };
    },
  }),
  GET: createAuthedAPIRoute({
    name: "Get Comments",
    querySchema: GetCommentsV1Query,
    responseSchema: GetCommentsV1Response,
    fn: async ({ query, auth }) => {
      const { objectType, objectId, authorUserId } = query;

      const comments = await prisma.comment.findMany({
        where: {
          projectId: auth.scope.projectId,
          objectType: objectType ?? undefined,
          objectId: objectId ?? undefined,
          authorUserId: authorUserId ?? undefined,
        },
      });

      return { data: comments };
    },
  }),
});
