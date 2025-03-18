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
import {
  getScoreById,
  logger,
  traceException,
  ScoreDeleteQueue,
} from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { QueueJobs } from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

export default withMiddlewares({
  GET: createAuthedAPIRoute({
    name: "Get Score",
    querySchema: GetScoreQuery,
    responseSchema: GetScoreResponse,
    fn: async ({ query, auth }) => {
      const score = await getScoreById(auth.scope.projectId, query.scoreId);

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
    successStatusCode: 202,
    fn: async ({ query, auth }) => {
      const { scoreId } = query;

      const scoreDeleteQueue = ScoreDeleteQueue.getInstance();
      if (!scoreDeleteQueue) {
        throw new InternalServerError("ScoreDeleteQueue not initialized");
      }

      await auditLog({
        action: "delete",
        resourceType: "score",
        resourceId: scoreId,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
      });

      await scoreDeleteQueue.add(QueueJobs.ScoreDelete, {
        timestamp: new Date(),
        id: randomUUID(),
        payload: {
          projectId: auth.scope.projectId,
          scoreIds: [scoreId],
        },
        name: QueueJobs.ScoreDelete,
      });

      return { message: "Score deletion queued successfully" };
    },
  }),
});
