import { env } from "@/src/env.mjs";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { transformDbToApiObservation } from "@/src/features/public-api/types/observations";
import { filterAndValidateDbScoreList } from "@/src/features/public-api/types/scores";
import {
  GetTraceV1Query,
  GetTraceV1Response,
} from "@/src/features/public-api/types/traces";
import {
  getTraceObservations,
  getScores,
  getTrace,
} from "@/src/server/api/repositories/clickhouse";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";

export default withMiddlewares({
  GET: createAuthedAPIRoute({
    name: "Get Single Trace",
    querySchema: GetTraceV1Query,
    responseSchema: GetTraceV1Response,
    fn: async ({ query, auth }) => {
      const { traceId } = query;

      const trace = env.SERVE_FROM_CLICKHOUSE
        ? await queryTracesAndScoresFromClickhouse(
            traceId,
            auth.scope.projectId,
          )
        : await prisma.trace.findFirst({
            where: {
              id: traceId,
              projectId: auth.scope.projectId,
            },
            include: {
              scores: true,
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
        env.SERVE_FROM_CLICKHOUSE
          ? await getTraceObservations(traceId, auth.scope.projectId)
          : await prisma.observationView.findMany({
              where: {
                traceId: traceId,
                projectId: auth.scope.projectId,
              },
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

const queryTracesAndScoresFromClickhouse = async (
  traceId: string,
  projectId: string,
): Promise<any> => {
  const trace = await getTrace(traceId, projectId);
  const scores = await getScores(traceId, projectId);

  return {
    ...trace,
    scores,
  };
};
