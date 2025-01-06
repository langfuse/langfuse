import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { measureAndReturnApi } from "@/src/server/utils/checkClickhouseAccess";
import {
  DeleteScoreQuery,
  DeleteScoreResponse,
  GetScoreQuery,
  GetScoreResponse,
  InternalServerError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  deleteScore,
  getScoreById,
  logger,
  traceException,
} from "@langfuse/shared/src/server";

export default withMiddlewares({
  GET: createAuthedAPIRoute({
    name: "Get Score",
    querySchema: GetScoreQuery,
    responseSchema: GetScoreResponse,
    fn: async ({ query, auth }) => {
      const { scoreId } = query;

      const score = await measureAndReturnApi({
        input: { projectId: auth.scope.projectId, queryClickhouse: false },
        operation: "api/public/scores/[scoreId]",
        user: null,
        pgExecution: async () => {
          return await prisma.score.findUnique({
            where: {
              id: scoreId,
              projectId: auth.scope.projectId,
            },
          });
        },
        clickhouseExecution: async () => {
          return await getScoreById(auth.scope.projectId, scoreId);
        },
      });

      if (!score) {
        throw new LangfuseNotFoundError("Score not found");
      }

      const parsedScore = GetScoreResponse.safeParse(score);

      if (!parsedScore.success) {
        traceException(parsedScore.error);
        logger.error(`Incorrect score return type ${parsedScore.error}`);
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

      await Promise.all([
        prisma.score.deleteMany({
          where: {
            id: scoreId,
            projectId: auth.scope.projectId,
          },
        }),
        deleteScore(auth.scope.projectId, scoreId),
      ]);

      return { message: "Score deleted successfully" };
    },
  }),
});
