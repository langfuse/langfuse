import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import {
  DeleteScoreQuery,
  DeleteScoreResponse,
  GetScoreQuery,
  GetScoreResponse,
} from "@/src/features/public-api/types/scores";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { ZodError } from "zod";

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

      const validatedScore = GetScoreResponse.safeParse(score);

      if (!validatedScore.success) {
        throw new ZodError(validatedScore.error.errors); // figure out if the right one
      }

      return validatedScore.data;
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
        throw new LangfuseNotFoundError("Score not found");
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
