import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  DeleteScoreQuery,
  DeleteScoreResponse,
  GetScoreQuery,
  GetScoreResponse,
  InternalServerError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { traceException } from "@langfuse/shared/src/server";

export default withMiddlewares({
  GET: createAuthedAPIRoute({
    name: "Get Score",
    querySchema: GetScoreQuery,
    responseSchema: GetScoreResponse,
    fn: async ({ query, auth }) => {
      const { scoreId } = query;

      const score = await prisma.score.findUnique({
        where: {
          id: scoreId,
          projectId: auth.scope.projectId,
        },
      });

      if (!score) {
        throw new LangfuseNotFoundError("Score not found");
      }

      const parsedScore = GetScoreResponse.safeParse(score);

      if (!parsedScore.success) {
        traceException(parsedScore.error);
        throw new InternalServerError("Requested score is corrupted");
      }

      return parsedScore.data;
    },
  }),
  DELETE: createAuthedAPIRoute({
    name: "Delete Score",
    querySchema: DeleteScoreQuery,
    responseSchema: DeleteScoreResponse,
    fn: async ({ query, auth }) => {
      const { scoreId } = query;

      const score = await prisma.score.findUnique({
        select: {
          id: true,
        },
        where: {
          id: scoreId,
          projectId: auth.scope.projectId,
        },
      });

      if (!score) {
        throw new LangfuseNotFoundError(
          "Score not found within authorized project",
        );
      }

      await prisma.score.delete({
        where: {
          id: scoreId,
          projectId: auth.scope.projectId,
        },
      });

      return { message: "Score deleted successfully" };
    },
  }),
});
