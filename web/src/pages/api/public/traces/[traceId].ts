import { prisma } from "@langfuse/shared/src/db";
import {
  GetTraceV1Query,
  GetTraceV1Response,
} from "@/src/features/public-api/types/traces";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { filterAndValidateDbScoreList } from "@/src/features/public-api/types/scores";
import { transformDbToApiObservation } from "@/src/features/public-api/types/observations";
import { LangfuseNotFoundError } from "@langfuse/shared";

export default withMiddlewares({
  GET: createAuthedAPIRoute({
    name: "Get Single Trace",
    querySchema: GetTraceV1Query,
    responseSchema: GetTraceV1Response,
    fn: async ({ query, auth }) => {
      const { traceId } = query;

      const trace = await prisma.traceView.findFirst({
        where: {
          id: traceId,
          projectId: auth.scope.projectId,
        },
      });

      if (!trace) {
        throw new LangfuseNotFoundError(
          "Trace not found within authorized project",
        );
      }

      const [scores, observations] = await Promise.all([
        prisma.score.findMany({
          where: {
            traceId: traceId,
            projectId: auth.scope.projectId,
          },
          orderBy: { timestamp: "desc" },
        }),
        prisma.observationView.findMany({
          where: {
            traceId: traceId,
            projectId: auth.scope.projectId,
          },
          orderBy: { startTime: "asc" },
        }),
      ]);

      const outObservations = observations.map(transformDbToApiObservation);
      const validatedScores = filterAndValidateDbScoreList(scores);

      const { duration, ...restOfTrace } = trace;

      return {
        ...restOfTrace,
        scores: validatedScores,
        htmlPath: `/project/${auth.scope.projectId}/traces/${traceId}`,
        totalCost: outObservations.reduce(
          (acc, obs) => acc + (obs.calculatedTotalCost ?? 0),
          0,
        ),
        latency: duration ?? 0,
        observations: outObservations,
      };
    },
  }),
});
